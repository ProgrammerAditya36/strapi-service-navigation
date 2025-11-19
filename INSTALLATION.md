# Installation Guide

## Quick Start

### Method 1: Install from VSIX (Recommended for Production)

1. **Package the extension:**
   ```bash
   cd vscode-extension-strapi-service-navigation
   npm install -g @vscode/vsce
   vsce package
   ```
   This creates a `.vsix` file in the directory.

2. **Install in VS Code:**
   - Open VS Code
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Install from VSIX..."
   - Select the generated `.vsix` file
   - Reload VS Code when prompted

### Method 2: Development Mode (For Testing)

1. **Open the extension folder:**
   ```bash
   cd vscode-extension-strapi-service-navigation
   code .
   ```

2. **Launch Extension Development Host:**
   - Press `F5` in VS Code
   - A new "Extension Development Host" window will open

3. **Test the extension:**
   - In the new window, open your Strapi project
   - Try Cmd+Click on a service method call

## Verification

After installation, test the extension:

1. Open a file with a Strapi service call:
   ```javascript
   const result = await strapi.service('api::user-profile.user-profile').isUsernameValid(username, null);
   ```

2. **Cmd+Click** (or **Ctrl+Click**) on `isUsernameValid`

3. You should be navigated to:
   `src/api/user-profile/services/user-profile.js`

## Troubleshooting

### Extension not working?

1. **Check if extension is active:**
   - Open Output panel (`Cmd+Shift+U`)
   - Select "Strapi Service Navigation" from the dropdown
   - You should see: "Strapi Service Navigation extension is now active!"

2. **Verify file structure:**
   - Ensure your service files follow the pattern: `src/api/{content-type}/services/{content-type}.js`
   - Check that the service name matches: `api::{content-type}.{content-type}`

3. **Check configuration:**
   - Open VS Code settings
   - Search for "strapiServiceNavigation"
   - Verify `srcPath` is set correctly (default: "src")

### Method not found?

- The method might be defined with a different syntax
- Check if the method name matches exactly (case-sensitive)
- Verify the method is exported in the service file

## Uninstallation

1. Open Extensions view (`Cmd+Shift+X`)
2. Search for "Strapi Service Navigation"
3. Click the gear icon → "Uninstall"
4. Reload VS Code

