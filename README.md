# Strapi Service Navigation

A VS Code extension that enables **Go to Definition** (Cmd+Click / F12) for Strapi service method calls.

## Problem

In Strapi projects, service methods are called using dynamic string-based lookups:

```javascript
const result = await strapi.service('api::sample-content.sample-content').validateEntry(username, null);
```

VS Code's default JavaScript language server cannot resolve these dynamic service calls, making it impossible to navigate to method definitions.

## Solution

This extension provides a custom definition provider that:

1. Detects when you click on a service method call
2. Resolves the service file path from the service name
3. Finds the method definition in the service file
4. Navigates you directly to the method

## Features

- ✅ **Go to Definition** (Cmd+Click / F12) on service method calls
- ✅ Automatic service file path resolution
- ✅ Method definition detection in service files
- ✅ Works with async/await and regular function syntax
- ✅ Configurable source path

## Installation

### Option 1: Install from VSIX (Recommended)

1. Package the extension:
   ```bash
   cd vscode-extension-strapi-service-navigation
   npm install -g vsce
   vsce package
   ```

2. Install in VS Code:
   - Open VS Code
   - Go to Extensions (Cmd+Shift+X)
   - Click the "..." menu → "Install from VSIX..."
   - Select the generated `.vsix` file

### Option 2: Development Mode

1. Open the extension folder in VS Code:
   ```bash
   cd vscode-extension-strapi-service-navigation
   code .
   ```

2. Press F5 to launch a new Extension Development Host window

3. In the new window, open your Strapi project

## Usage

Simply **Cmd+Click** (or **Ctrl+Click** on Windows/Linux) on any service method call:

```javascript
// Cmd+Click on "validateEntry" will navigate to:
// src/api/sample-content/services/sample-content.js
const usernameCheck = await strapi.service('api::sample-content.sample-content').validateEntry(username, null);
```

You can also use **F12** (Go to Definition) or **Right-click → Go to Definition**.

## Configuration

You can configure the source path in VS Code settings:

```json
{
  "strapiServiceNavigation.srcPath": "src"
}
```

The default is `"src"`, which works for standard Strapi projects.

## How It Works

1. **Pattern Detection**: The extension detects patterns like:
   - `strapi.service('api::content-type.content-type').methodName`

2. **Path Resolution**: It resolves the service file path:
   - Service name: `api::sample-content.sample-content`
   - Content type: `sample-content`
   - File path: `src/api/sample-content/services/sample-content.js`

3. **Method Finding**: It searches for method definitions matching:
   - `async methodName(...)`
   - `methodName(...)`
   - `methodName: function(...)`
   - `'methodName': function(...)`
   - `"methodName": function(...)`

## Supported Patterns

The extension works with these service call patterns:

```javascript
// Standard call
await strapi.service('api::sample-content.sample-content').functionName(param1, param2);

// Chained calls
const service = strapi.service('api::sample-content.sample-content');
const feed = await service.functionName(param1, param2);

// With variables
const serviceName = 'api::sample-content.sample-content';
await strapi.service(serviceName).functionName(param1, param2);
```

## Limitations

- Only works with literal string service names (not variables)
- Method name must be directly after the service call (no intermediate variables)
- Requires service files to follow Strapi's standard structure

## Troubleshooting

### Extension not working?

1. Make sure the extension is activated (check the Output panel → "Strapi Service Navigation")
2. Verify your service file path matches the pattern: `src/api/{content-type}/services/{content-type}.js`
3. Check that the method name matches exactly (case-sensitive)

### Method not found?

- The method might be defined with a different syntax
- Check if the method is exported correctly
- Verify the file path is correct

## Development

### Project Structure

```
vscode-extension-strapi-service-navigation/
├── extension.js      # Main extension code
├── package.json      # Extension manifest
└── README.md         # This file
```

### Testing

1. Open the extension folder in VS Code
2. Press F5 to launch Extension Development Host
3. Test Go to Definition on service method calls

## License

MIT

## Contributing

Feel free to submit issues and pull requests!

