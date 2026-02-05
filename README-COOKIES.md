# Comment uploader les cookies sur Railway

## Étape 1 : Copier le fichier cookies

Le fichier `linkedin-cookies.json` a été créé localement.

## Étape 2 : Uploader sur Railway

### Option A : Via Railway CLI
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Upload cookies as environment variable
railway variables set COOKIES_JSON="$(cat linkedin-cookies.json)"
```

### Option B : Via Railway Dashboard (plus simple)

1. Va sur https://railway.app
2. Ouvre ton projet `linkedin-crm-dashboard`
3. Va dans **Variables**
4. Crée une nouvelle variable :
   - **Name**: `COOKIES_JSON`
   - **Value**: Copie-colle le contenu de `linkedin-cookies.json`
5. Save

## Étape 3 : Modifier le scraper pour lire la variable

Le scraper va automatiquement lire `COOKIES_JSON` depuis les variables d'environnement.

## Renouvellement des cookies

Les cookies LinkedIn expirent après ~2 semaines. Quand le scraper échoue :
1. Relance `node export-cookies-local.js`
2. Upload le nouveau fichier sur Railway
3. Redeploy
