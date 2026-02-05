# 🚂 Déploiement Railway - Guide Complet

## 📋 Variables d'Environnement à Configurer

Copie ces variables dans Railway Dashboard > Variables :

```bash
SUPABASE_URL=https://igyxcobujacampiqndpf.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlneXhjb2J1amFjYW1waXFuZHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDYxMTUsImV4cCI6MjA4NTUyMjExNX0.8jgz6G0Irj6sRclcBKzYE5VzzXNrxzHgrAz45tHfHpc
KIMI_API_KEY=sk-VZwqHiJdkuPNkkV5CxNCyc81ZYDNg3WLlRPexmpVZFGB6kXW
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=moonshot-v1-32k
LINKEDIN_EMAIL=aitorgarcia2112@gmail.com
LINKEDIN_PASSWORD=21AiPa01....
NODE_ENV=production
PORT=3000
```

## 🚀 Étapes de Déploiement

### 1. Créer un Repo GitHub (si pas déjà fait)

```bash
cd "/Users/aitorgarcia/Library/Mobile Documents/com~apple~CloudDocs/LINKIFG/dashboard"
git init
git add .
git commit -m "Initial commit - LinkedIn AI CRM Dashboard"
gh repo create linkedin-crm-dashboard --public --source=. --push
```

### 2. Déployer sur Railway

1. Va sur [railway.app](https://railway.app)
2. Clique sur **"New Project"**
3. Sélectionne **"Deploy from GitHub repo"**
4. Choisis le repo `linkedin-crm-dashboard`
5. Railway détecte automatiquement le `package.json`

### 3. Configurer les Variables

Dans Railway Dashboard :
- Clique sur ton projet
- Onglet **"Variables"**
- Colle toutes les variables ci-dessus
- Clique **"Deploy"**

### 4. Obtenir l'URL

Une fois déployé :
- Railway génère une URL type : `https://linkedin-crm-dashboard-production.up.railway.app`
- Copie cette URL et ouvre-la dans ton navigateur

---

## 🔧 Alternative : Déploiement Direct (sans GitHub)

```bash
cd "/Users/aitorgarcia/Library/Mobile Documents/com~apple~CloudDocs/LINKIFG/dashboard"
npm install -g @railway/cli
railway login
railway init
railway up
```

Puis configure les variables dans le dashboard Railway.

---

## ✅ Vérification

Une fois déployé, ton dashboard sera accessible 24/7 sur Railway.
Tu pourras :
- ✅ Voir tes conversations LinkedIn
- ✅ Trigger le scraping manuellement
- ✅ Voir les stats en temps réel

---

## 💡 Note Importante

Le dashboard est **statique** (HTML/JS pur), donc :
- Pas besoin de backend Node.js
- Très léger et rapide
- Coût Railway : **$0** (Free tier suffit)

Les Edge Functions tournent sur **Supabase** (déjà déployées), pas sur Railway.
