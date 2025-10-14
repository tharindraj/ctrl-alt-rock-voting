# Azure Deployment Guide for CTRL + ALT + ROCK Voting App

## Prerequisites
- Azure account with active subscription
- Git repository (GitHub recommended)
- Azure CLI installed (optional but recommended)

## Option 1: Azure App Service + Static Web Apps (Recommended)

### Step 1: Deploy Backend (Server) to Azure App Service

#### Method A: Using Azure Portal
1. Go to [Azure Portal](https://portal.azure.com)
2. Create Resource → App Service
3. Configuration:
   - **Runtime Stack**: Node 18 LTS
   - **Operating System**: Linux (recommended) or Windows
   - **Region**: Choose closest to your users
   - **Pricing**: Basic B1 (minimum for production)

4. **Deployment**:
   - Go to Deployment Center
   - Source: GitHub (connect your repository)
   - Branch: main/master
   - Build provider: GitHub Actions

5. **Environment Variables** (Configuration → Application Settings):
   ```
   PORT=80
   NODE_ENV=production
   JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
   CORS_ORIGIN=https://your-static-web-app.azurestaticapps.net
   ```

#### Method B: Using Azure CLI
```bash
# Login to Azure
az login

# Create resource group
az group create --name rg-voting-app --location "East US"

# Create App Service plan
az appservice plan create --name plan-voting-app --resource-group rg-voting-app --sku B1 --is-linux

# Create web app
az webapp create --resource-group rg-voting-app --plan plan-voting-app --name your-unique-app-name --runtime "NODE|18-lts" --deployment-source-url https://github.com/yourusername/your-repo.git --deployment-source-branch main

# Configure app settings
az webapp config appsettings set --resource-group rg-voting-app --name your-unique-app-name --settings PORT=80 NODE_ENV=production JWT_SECRET=your_secret_here
```

### Step 2: Deploy Frontend (Client) to Azure Static Web Apps

#### Method A: Using Azure Portal
1. Create Resource → Static Web Apps
2. Source: GitHub
3. Repository: Select your repo
4. Branch: main/master
5. Build Presets: React
6. App location: `/client`
7. Output location: `build`

#### Method B: Using Azure CLI
```bash
# Create Static Web App
az staticwebapp create --name your-static-app-name --resource-group rg-voting-app --source https://github.com/yourusername/your-repo --branch main --app-location "/client" --output-location "build" --login-with-github
```

### Step 3: Update Configuration

1. **Update Client Environment Variables**:
   - In your repository, update `client/.env.production`:
   ```
   REACT_APP_API_URL=https://your-app-service-name.azurewebsites.net/api
   ```

2. **Update Backend CORS**:
   - Add your Static Web App URL to CORS_ORIGIN in App Service settings

3. **Fix Hardcoded URLs** (Important!):
   You need to replace all hardcoded `http://localhost:5000` URLs in your React components with environment variables.

## Option 2: Container Deployment (Advanced)

### Using Azure Container Instances

1. **Create Dockerfiles** (see previous examples)
2. **Build and Push to Azure Container Registry**:
```bash
# Create container registry
az acr create --resource-group rg-voting-app --name yourvotingappregistry --sku Basic --admin-enabled true

# Build and push server
az acr build --registry yourvotingappregistry --image voting-server:latest ./server

# Build and push client
az acr build --registry yourvotingappregistry --image voting-client:latest ./client

# Deploy to Container Instances
az container create --resource-group rg-voting-app --name voting-server-container --image yourvotingappregistry.azurecr.io/voting-server:latest --cpu 1 --memory 1 --registry-login-server yourvotingappregistry.azurecr.io --registry-username yourvotingappregistry --registry-password [password] --dns-name-label voting-server --ports 5000
```

## Option 3: Azure Virtual Machine (Full Control)

### Create and Configure VM
```bash
# Create VM
az vm create --resource-group rg-voting-app --name voting-vm --image UbuntuLTS --admin-username azureuser --generate-ssh-keys --size Standard_B2s

# Open ports
az vm open-port --resource-group rg-voting-app --name voting-vm --port 80 --priority 1000
az vm open-port --resource-group rg-voting-app --name voting-vm --port 5000 --priority 1010

# SSH into VM and install dependencies
ssh azureuser@[vm-ip-address]

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Clone your repository
git clone https://github.com/yourusername/your-repo.git
cd your-repo

# Install dependencies
npm run install-all

# Build client
cd client && npm run build

# Start server with PM2
cd ../server
pm2 start server.js --name "voting-server"

# Configure Nginx to serve React app and proxy API calls
# (Nginx configuration needed)
```

## Production Checklist

### Security
- [ ] Change JWT_SECRET to a strong, unique value
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure proper CORS origins
- [ ] Set up environment variables (never commit secrets)
- [ ] Enable Azure Application Insights for monitoring

### Performance
- [ ] Enable compression in Express server
- [ ] Configure Azure CDN for static assets
- [ ] Set up Azure Application Gateway if needed
- [ ] Monitor resource usage and scale appropriately

### Backup & Database
- [ ] Set up Azure Database for PostgreSQL/MySQL if needed
- [ ] Configure backup strategies
- [ ] Set up Azure Storage for file uploads

### Monitoring
- [ ] Enable Application Insights
- [ ] Set up alerts for downtime
- [ ] Monitor performance metrics

## Estimated Costs (Monthly)

### Minimal Setup
- App Service (Basic B1): ~$13/month
- Static Web App: Free tier (up to 100GB bandwidth)
- **Total: ~$13/month**

### Production Setup
- App Service (Standard S1): ~$73/month
- Azure Database (Basic): ~$5/month
- Storage Account: ~$2/month
- Application Insights: ~$2/month
- **Total: ~$82/month**

## Next Steps

1. Choose your deployment method
2. Set up Azure resources
3. Update hardcoded URLs in your code
4. Configure environment variables
5. Test thoroughly before going live
6. Set up monitoring and backups

Would you like me to help you with any specific part of this deployment process?