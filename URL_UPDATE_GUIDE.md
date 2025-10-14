# Script to Update Hardcoded URLs for Azure Deployment

## Step-by-Step URL Replacement Guide

### Files that need updates:

1. **client/src/components/admin/SettingsManager.js**
   - Replace `http://localhost:5000/api/admin/admin-users` with axios calls using baseURL
   - Replace image URLs `http://localhost:5000${user.image}` with `buildImageUrl(user.image)`

2. **client/src/components/admin/JudgesManager.js**
   - Replace `http://localhost:5000${judge.image}` with `buildImageUrl(judge.image)`

3. **client/src/components/admin/ResultsManager.js**
   - Replace `http://localhost:5000${contestant.image}` with `buildImageUrl(contestant.image)`

4. **client/src/components/admin/ContestantsManager.js**
   - Replace `http://localhost:5000${contestant.image}` with `buildImageUrl(contestant.image)`

5. **client/src/components/admin/CategoriesManager.js**
   - Replace `http://localhost:5000${category.image}` with `buildImageUrl(category.image)`

6. **client/src/components/judge/ScoringInterface.js**
   - Replace image URLs with `buildImageUrl()` helper

7. **client/src/components/audience/AudienceDashboard.js**
   - Replace all image URLs with `buildImageUrl()` helper

### Quick Fix Commands:

You can run these PowerShell commands to update the files automatically:

```powershell
# Navigate to your project directory
cd "C:\Users\TharindraJayamaha\OneDrive - 99x\TJ\MyScripts\OnlineVoting"

# Add import statements to all component files
$files = @(
    "client\src\components\admin\SettingsManager.js",
    "client\src\components\admin\JudgesManager.js", 
    "client\src\components\admin\ResultsManager.js",
    "client\src\components\admin\ContestantsManager.js",
    "client\src\components\admin\CategoriesManager.js",
    "client\src\components\judge\ScoringInterface.js",
    "client\src\components\audience\AudienceDashboard.js"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        # Add import at the top of each file
        $content = Get-Content $file -Raw
        if ($content -notmatch "buildImageUrl") {
            $newImport = "import { buildImageUrl } from '../../config/api';`n"
            $content = $content -replace "(import.*?;`n)", "`$1$newImport"
            Set-Content $file $content
        }
        
        # Replace hardcoded image URLs
        (Get-Content $file -Raw) -replace 'http://localhost:5000\$\{([^}]+)\}', 'buildImageUrl($1)' | Set-Content $file
        
        Write-Host "Updated: $file"
    }
}
```

### Manual Updates Required:

For API calls in SettingsManager.js that use full URLs instead of axios baseURL, you'll need to manually update these lines:

```javascript
// Before:
const response = await axios.get('http://localhost:5000/api/admin/admin-users', {

// After:
const response = await axios.get('/admin/admin-users', {
```

### Testing Your Changes:

1. Update your environment variables:
   ```bash
   # In client/.env.local (for local testing)
   REACT_APP_API_URL=http://localhost:5000

   # In client/.env.production (for Azure)
   REACT_APP_API_URL=https://your-app-service-name.azurewebsites.net
   ```

2. Test locally first:
   ```bash
   cd client
   npm start
   ```

3. Build for production:
   ```bash
   cd client
   npm run build
   ```

### Deployment Checklist:

- [ ] Created api.js config file
- [ ] Updated all hardcoded URLs in components
- [ ] Added buildImageUrl import statements
- [ ] Updated environment variables
- [ ] Tested locally
- [ ] Built production version
- [ ] Ready for Azure deployment

Would you like me to help you implement these changes automatically?