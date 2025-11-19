const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const SUPPORTED_SCRIPT_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx'];

/**
 * Activates the extension
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Strapi Service Navigation extension is now active!');

  // Register definition provider for JavaScript files
  const provider = new StrapiServiceDefinitionProvider();
  const disposable = vscode.languages.registerDefinitionProvider(
    { scheme: 'file', language: 'javascript' },
    provider
  );

  context.subscriptions.push(disposable);
}

/**
 * Definition provider for Strapi service method calls
 */
class StrapiServiceDefinitionProvider {
  /**
   * Provide definition for a symbol at the given position
   * @param {vscode.TextDocument} document
   * @param {vscode.Position} position
   * @param {vscode.CancellationToken} token
   * @returns {Promise<vscode.Definition|vscode.LocationLink[]>}
   */
  provideDefinition(document, position, token) {
    // Check if cursor is on a service method call
    const serviceCallMatch = this.findServiceCallAtPosition(document, position);
    if (serviceCallMatch) {
      const { serviceName, methodName } = serviceCallMatch;
      const serviceFilePath = this.resolveServiceFilePath(document, serviceName);
      if (!serviceFilePath) {
        return null;
      }

      if (!fs.existsSync(serviceFilePath)) {
        vscode.window.showWarningMessage(`Service file not found: ${serviceFilePath}`);
        return null;
      }

      return this.findMethodDefinition(serviceFilePath, methodName);
    }

    // Check if cursor is on a controller handler reference (e.g., handler: 'recommendation.getFeedV2')
    const controllerHandlerMatch = this.findControllerHandlerAtPosition(document, position);
    if (controllerHandlerMatch) {
      const { namespace, apiName, controllerName, actionName } = controllerHandlerMatch;
      const controllerFilePath = this.resolveControllerFilePath(
        document,
        namespace,
        apiName,
        controllerName
      );

      if (!controllerFilePath) {
        return null;
      }

      if (!fs.existsSync(controllerFilePath)) {
        vscode.window.showWarningMessage(`Controller file not found: ${controllerFilePath}`);
        return null;
      }

      return this.findMethodDefinition(controllerFilePath, actionName);
    }

    return null;
  }

  /**
   * Find service call pattern at cursor position
   * Pattern: strapi.service('api::content-type.content-type').methodName
   * @param {string} lineText
   * @param {number} character
   * @returns {{serviceName: string, methodName: string}|null}
   */
  findServiceCallAtPosition(document, position) {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Try inline service call on the same line
    const inlineMatch = this.matchInlineServiceCall(lineText, position.character);
    if (inlineMatch) {
      return inlineMatch;
    }

    // Try chained service call via variable reference
    return this.matchChainedServiceCall(document, position);
  }

  /**
   * Match inline strapi service call on the same line
   * @param {string} lineText
   * @param {number} character
   */
  matchInlineServiceCall(lineText, character) {
    const serviceCallRegex = /strapi\.service\(['"](api::[^'"]+)['"]\)\.(\w+)/g;
    let match;

    while ((match = serviceCallRegex.exec(lineText)) !== null) {
      const serviceName = match[1];
      const methodName = match[2];

      const methodStartPos = match.index + match[0].indexOf('.' + methodName) + 1;
      const methodEndPos = methodStartPos + methodName.length;

      if (character >= methodStartPos && character <= methodEndPos) {
        return { serviceName, methodName };
      }
    }

    return null;
  }

  /**
   * Match chained service call where service is stored in a variable
   * @param {vscode.TextDocument} document
   * @param {vscode.Position} position
   */
  matchChainedServiceCall(document, position) {
    const wordRange = document.getWordRangeAtPosition(position, /[\w$]+/);
    if (!wordRange) {
      return null;
    }

    const methodName = document.getText(wordRange);
    const lineText = document.lineAt(position.line).text;
    const methodStartCharacter = wordRange.start.character;
    const textBeforeMethod = lineText.slice(0, methodStartCharacter);
    const dotIndex = textBeforeMethod.lastIndexOf('.');

    if (dotIndex === -1) {
      return null;
    }

    let variablePart = textBeforeMethod.slice(0, dotIndex).trimEnd();
    if (variablePart.endsWith('?')) {
      variablePart = variablePart.slice(0, -1).trimEnd();
    }
    const variableMatch = variablePart.match(/([A-Za-z_$][\w$]*)\s*$/);

    if (!variableMatch) {
      return null;
    }

    const variableName = variableMatch[1];
    const serviceName = this.findServiceNameForVariable(document, position.line, variableName);

    if (!serviceName) {
      return null;
    }

    return { serviceName, methodName };
  }

  /**
   * Detect handler string (e.g., handler: 'recommendation.getFeedV2') at cursor position
   * @param {vscode.TextDocument} document
   * @param {vscode.Position} position
   * @returns {{namespace: string, apiName: string, controllerName: string, actionName: string}|null}
   */
  findControllerHandlerAtPosition(document, position) {
    const lineText = document.lineAt(position.line).text;
    const handlerRegex = /(?:['"])?handler(?:['"])?\s*:\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = handlerRegex.exec(lineText)) !== null) {
      const handlerValue = match[1];
      const handlerStart = lineText.indexOf(handlerValue, match.index);
      if (handlerStart === -1) {
        continue;
      }

      const handlerEnd = handlerStart + handlerValue.length;
      if (position.character >= handlerStart && position.character <= handlerEnd) {
        return this.parseHandlerString(handlerValue, document);
      }
    }

    return null;
  }

  /**
   * Parse handler string into namespace, api, controller, and action identifiers
   * @param {string} handlerValue
   */
  parseHandlerString(handlerValue, document) {
    if (!handlerValue) {
      return null;
    }

    let namespace = 'api';
    let rest = handlerValue;
    const inferredApiName = this.inferApiNameFromDocument(document);

    const namespaceSeparatorIndex = handlerValue.indexOf('::');
    if (namespaceSeparatorIndex !== -1) {
      namespace = handlerValue.slice(0, namespaceSeparatorIndex);
      rest = handlerValue.slice(namespaceSeparatorIndex + 2);
    }

    const segments = rest.split('.').filter(Boolean);
    if (segments.length === 0) {
      return null;
    }

    const actionName = segments.pop();
    const controllerName = segments.pop() || null;
    let apiName = null;

    if (!controllerName) {
      return null;
    }

    if (namespace === 'api' || namespace === 'plugin') {
      if (handlerValue.includes('::')) {
        apiName = segments.shift() || controllerName;
      }

      if (!apiName) {
        apiName = inferredApiName || controllerName;
      }
    } else {
      return null;
    }

    return {
      namespace,
      apiName,
      controllerName,
      actionName
    };
  }

  /**
   * Infer api name from the current document's path (e.g., src/api/<apiName>/routes/*.js)
   * @param {vscode.TextDocument} document
   * @returns {string|null}
   */
  inferApiNameFromDocument(document) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return null;
    }

    const config = vscode.workspace.getConfiguration('strapiServiceNavigation');
    const srcPath = config.get('srcPath', 'src');
    const srcAbsolutePath = path.join(workspaceFolder.uri.fsPath, srcPath);
    const documentPath = document.uri.fsPath;

    if (!documentPath.startsWith(srcAbsolutePath)) {
      return null;
    }

    const relativeToSrc = path.relative(srcAbsolutePath, documentPath);
    const segments = relativeToSrc.split(path.sep);

    if (segments.length < 3 || segments[0] !== 'api') {
      return null;
    }

    return segments[1] || null;
  }

  /**
   * Resolve service file path from service name
   * @param {vscode.TextDocument} document
   * @param {string} serviceName - e.g., "api::user-profile.user-profile"
   * @returns {string|null}
   */
  resolveServiceFilePath(document, serviceName) {
    // Parse service name: "api::user-profile.user-profile"
    // Extract content type: "user-profile"
    const [namespacePrefix, rest] = serviceName.split('::');
    if (namespacePrefix !== 'api' || !rest) {
      return null;
    }

    const parts = rest.split('.');
    const contentType = parts[0];
    const serviceFileName = parts.slice(1).join('.') || contentType;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return null;
    }

    // Get src path from configuration or use default
    const config = vscode.workspace.getConfiguration('strapiServiceNavigation');
    const srcPath = config.get('srcPath', 'src');

    // Build service file path: src/api/{content-type}/services/{content-type}.js
    const serviceBasePath = path.join(
      workspaceFolder.uri.fsPath,
      srcPath,
      'api',
      contentType,
      'services',
      serviceFileName
    );

    return this.resolveFileWithExtensions(serviceBasePath);
  }

  /**
   * Resolve controller file path from handler info
   * @param {vscode.TextDocument} document
   * @param {'api'|'plugin'} namespace
   * @param {string} apiName
   * @param {string} controllerName
   * @returns {string|null}
   */
  resolveControllerFilePath(document, namespace, apiName, controllerName) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return null;
    }

    const config = vscode.workspace.getConfiguration('strapiServiceNavigation');
    const srcPath = config.get('srcPath', 'src');

    let controllerBasePath;
    if (namespace === 'api') {
      controllerBasePath = path.join(
        workspaceFolder.uri.fsPath,
        srcPath,
        'api',
        apiName,
        'controllers',
        controllerName
      );
    } else if (namespace === 'plugin') {
      controllerBasePath = path.join(
        workspaceFolder.uri.fsPath,
        srcPath,
        'plugins',
        apiName,
        'controllers',
        controllerName
      );
    } else {
      return null;
    }

    const controllerPath = this.findExistingFileWithExtensions(controllerBasePath);
    if (controllerPath) {
      return controllerPath;
    }

    let servicesBasePath;
    if (namespace === 'api') {
      servicesBasePath = path.join(
        workspaceFolder.uri.fsPath,
        srcPath,
        'api',
        apiName,
        'services',
        controllerName
      );
    } else if (namespace === 'plugin') {
      servicesBasePath = path.join(
        workspaceFolder.uri.fsPath,
        srcPath,
        'plugins',
        apiName,
        'services',
        controllerName
      );
    }

    if (servicesBasePath) {
      const servicePath = this.findExistingFileWithExtensions(servicesBasePath);
      if (servicePath) {
        return servicePath;
      }
    }

    return `${controllerBasePath}.js`;
  }

  /**
   * Try to find a file by appending supported extensions. If none exist, fall back to .js.
   * @param {string} fileBasePath
   * @returns {string}
   */
  resolveFileWithExtensions(fileBasePath) {
    const existingPath = this.findExistingFileWithExtensions(fileBasePath);
    if (existingPath) {
      return existingPath;
    }

    return `${fileBasePath}.js`;
  }

  /**
   * Find a file by appending supported extensions. Returns null if nothing exists.
   * @param {string} fileBasePath
   * @returns {string|null}
   */
  findExistingFileWithExtensions(fileBasePath) {
    for (const ext of SUPPORTED_SCRIPT_EXTENSIONS) {
      const candidatePath = `${fileBasePath}${ext}`;
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    return null;
  }

  /**
   * Find method definition in service file
   * @param {string} filePath
   * @param {string} methodName
   * @returns {Promise<vscode.Location>}
   */
  async findMethodDefinition(filePath, methodName) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n');

      // Look for method definition patterns in Strapi services:
      // Most common: async methodName(...) { or methodName(...) {
      // Also support: methodName: function(...) { or 'methodName': function(...) {
      const escapedMethodName = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const methodPatterns = [
        // Pattern: async methodName( or methodName(
        new RegExp(`^\\s*(async\\s+)?${escapedMethodName}\\s*\\(`),
        // Pattern: methodName: function( or methodName: async function(
        new RegExp(`^\\s*${escapedMethodName}\\s*:\\s*(async\\s+)?function\\s*\\(`),
        // Pattern: 'methodName': function( or "methodName": function(
        new RegExp(`^\\s*['"]${escapedMethodName}['"]\\s*:\\s*(async\\s+)?function\\s*\\(`),
        // Pattern: methodName: async (...) => or methodName: (...) =>
        new RegExp(`^\\s*${escapedMethodName}\\s*:\\s*(async\\s+)?\\([^)]*\\)\\s*=>`),
        // Pattern: 'methodName': async (...) => or "methodName": (...) =>
        new RegExp(`^\\s*['"]${escapedMethodName}['"]\\s*:\\s*(async\\s+)?\\([^)]*\\)\\s*=>`)
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of methodPatterns) {
          const match = line.match(pattern);
          if (match) {
            // Find the position of methodName in the line
              const methodIndex = line.indexOf(methodName, match.index ?? 0);
            if (methodIndex !== -1) {
              const uri = vscode.Uri.file(filePath);
              const position = new vscode.Position(i, methodIndex);
              return new vscode.Location(uri, position);
            }
          }
        }
      }

      // If not found, show warning
      vscode.window.showWarningMessage(
        `Method "${methodName}" not found in service file: ${path.basename(filePath)}`
      );
      return null;
    } catch (error) {
      vscode.window.showErrorMessage(`Error reading service file: ${error.message}`);
      return null;
    }
  }

  /**
   * Find the service name assigned to a variable
   * @param {vscode.TextDocument} document
   * @param {number} startLine
   * @param {string} variableName
   * @returns {string|null}
   */
  findServiceNameForVariable(document, startLine, variableName) {
    const assignmentPatterns = [
      new RegExp(`(?:const|let|var)\\s+${variableName}\\s*=\\s*strapi\\.service\\(['"](api::[^'"]+)['"]\\)`),
      new RegExp(`${variableName}\\s*=\\s*strapi\\.service\\(['"](api::[^'"]+)['"]\\)`)
    ];

    for (let lineNumber = startLine; lineNumber >= 0; lineNumber--) {
      const lineText = document.lineAt(lineNumber).text;

      for (const pattern of assignmentPatterns) {
        const match = lineText.match(pattern);
        if (match) {
          return match[1];
        }
      }
    }

    return null;
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

