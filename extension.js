const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

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
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const offset = document.offsetAt(position);

    // Check if cursor is on a service method call
    const serviceCallMatch = this.findServiceCallAtPosition(lineText, position.character);
    if (!serviceCallMatch) {
      return null;
    }

    const { serviceName, methodName } = serviceCallMatch;

    // Resolve service file path
    const serviceFilePath = this.resolveServiceFilePath(document, serviceName);
    if (!serviceFilePath) {
      return null;
    }

    // Check if file exists
    if (!fs.existsSync(serviceFilePath)) {
      vscode.window.showWarningMessage(`Service file not found: ${serviceFilePath}`);
      return null;
    }

    // Find method definition in service file
    return this.findMethodDefinition(serviceFilePath, methodName);
  }

  /**
   * Find service call pattern at cursor position
   * Pattern: strapi.service('api::content-type.content-type').methodName
   * @param {string} lineText
   * @param {number} character
   * @returns {{serviceName: string, methodName: string}|null}
   */
  findServiceCallAtPosition(lineText, character) {
    // Match pattern: strapi.service('api::...').methodName
    // This regex matches the entire service call chain
    const serviceCallRegex = /strapi\.service\(['"](api::[^'"]+)['"]\)\.(\w+)/g;
    let match;

    while ((match = serviceCallRegex.exec(lineText)) !== null) {
      const startPos = match.index;
      const endPos = match.index + match[0].length;
      const serviceName = match[1];
      const methodName = match[2];

      // Check if cursor is within this match
      // We want to match if cursor is on the method name
      const methodStartPos = match.index + match[0].indexOf('.' + methodName) + 1;
      const methodEndPos = methodStartPos + methodName.length;

      if (character >= methodStartPos && character <= methodEndPos) {
        return { serviceName, methodName };
      }
    }

    return null;
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
    const match = serviceName.match(/^api::([^.]+)\./);
    if (!match) {
      return null;
    }

    const contentType = match[1];
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return null;
    }

    // Get src path from configuration or use default
    const config = vscode.workspace.getConfiguration('strapiServiceNavigation');
    const srcPath = config.get('srcPath', 'src');

    // Build service file path: src/api/{content-type}/services/{content-type}.js
    const serviceFilePath = path.join(
      workspaceFolder.uri.fsPath,
      srcPath,
      'api',
      contentType,
      'services',
      `${contentType}.js`
    );

    return serviceFilePath;
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
        // Pattern: async methodName( or methodName( - most common in Strapi
        new RegExp(`\\s*(async\\s+)?${escapedMethodName}\\s*\\(`),
        // Pattern: methodName: function( or methodName: async function(
        new RegExp(`${escapedMethodName}\\s*:\\s*(async\\s+)?function\\s*\\(`),
        // Pattern: 'methodName': function( or "methodName": function(
        new RegExp(`['"]${escapedMethodName}['"]\\s*:\\s*(async\\s+)?function\\s*\\(`),
        // Pattern: methodName: async (...) => or methodName: (...) =>
        new RegExp(`${escapedMethodName}\\s*:\\s*(async\\s+)?\\([^)]*\\)\\s*=>`),
        // Pattern: 'methodName': async (...) => or "methodName": (...) =>
        new RegExp(`['"]${escapedMethodName}['"]\\s*:\\s*(async\\s+)?\\([^)]*\\)\\s*=>`)
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of methodPatterns) {
          const match = line.match(pattern);
          if (match) {
            // Find the position of methodName in the line
            const methodIndex = line.indexOf(methodName);
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
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

