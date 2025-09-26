#!/bin/bash

# 🚀 DEPLOY V2 TO RENDER.com
# Sostituisce l'API chat esistente con la nuova architettura V2

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 DEPLOY CHAT API V2 TO RENDER.COM${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check we're in the right directory
if [[ ! -f "server.js" ]] || [[ ! -d "routes" ]]; then
    echo -e "${RED}❌ Error: Run this script from lucine-chatbot-render directory${NC}"
    exit 1
fi

# Check if V2 file exists
if [[ ! -f "routes/chat-v2.js" ]]; then
    echo -e "${RED}❌ Error: routes/chat-v2.js not found${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Current setup:${NC}"
echo "• routes/chat.js - Current V1 (will be backed up)"
echo "• routes/chat-v2.js - New V2 (ready to deploy)"
echo ""

# Deployment options
echo -e "${BLUE}Choose deployment strategy:${NC}"
echo "1. 🧪 Safe deployment (test V2 alongside V1)"
echo "2. 🔄 Full replacement (replace V1 with V2)"
echo "3. ❌ Cancel deployment"

read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo -e "\n${YELLOW}🧪 SAFE DEPLOYMENT${NC}"
        echo "This will:"
        echo "• Keep /api/chat (V1) running"
        echo "• Add /api/chat-v2 for testing"
        echo "• Allow gradual migration"
        
        if [[ ! $(grep -q "chat-v2" server.js) ]]; then
            echo ""
            echo "Adding V2 route to server.js..."
            
            # Backup server.js
            cp server.js server.js.backup
            
            # Add V2 route after existing chat route
            sed -i.bak "/import.*chat.*from.*'\.\/routes\/chat\.js'/a\\
import chatV2Router from './routes/chat-v2.js';" server.js
            
            sed -i.bak "/app\.use('\/api\/chat', chatRouter)/a\\
app.use('/api/chat-v2', chatV2Router);" server.js
            
            rm server.js.bak
            
            echo -e "${GREEN}✅ V2 route added to server.js${NC}"
        else
            echo -e "${GREEN}✅ V2 route already exists in server.js${NC}"
        fi
        
        echo ""
        echo -e "${GREEN}🎯 SAFE DEPLOYMENT COMPLETED${NC}"
        echo ""
        echo "Next steps:"
        echo "1. 🚀 Commit and push to trigger Render deployment"
        echo "2. 🧪 Test V2 at: https://lucine-chatbot.onrender.com/api/chat-v2"
        echo "3. ✅ Update Shopify to use chat-v2 when ready"
        echo ""
        echo "Test commands:"
        echo "curl -X POST https://lucine-chatbot.onrender.com/api/chat-v2 \\"
        echo "  -H 'Content-Type: application/json' \\"
        echo "  -d '{\"message\":\"Test V2\",\"sessionId\":\"test123\"}'"
        ;;
        
    2)
        echo -e "\n${RED}🔄 FULL REPLACEMENT${NC}"
        echo "⚠️  This will:"
        echo "• Backup current routes/chat.js to routes/chat-v1-backup.js"
        echo "• Replace routes/chat.js with V2 code"
        echo "• Make V2 the primary API immediately"
        
        read -p "Are you sure? This affects production immediately (y/N): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            echo "Creating backup..."
            cp routes/chat.js routes/chat-v1-backup.js
            echo -e "${GREEN}✅ Backup created: routes/chat-v1-backup.js${NC}"
            
            echo "Replacing chat.js with V2..."
            cp routes/chat-v2.js routes/chat.js
            echo -e "${GREEN}✅ routes/chat.js replaced with V2${NC}"
            
            echo ""
            echo -e "${GREEN}🎯 FULL REPLACEMENT COMPLETED${NC}"
            echo ""
            echo "Next steps:"
            echo "1. 🚀 Commit and push to deploy immediately"
            echo "2. ✅ Test at: https://lucine-chatbot.onrender.com/api/chat"
            echo "3. 🌐 Shopify will automatically use V2"
            
            echo ""
            echo "Rollback (if needed):"
            echo "cp routes/chat-v1-backup.js routes/chat.js"
            
        else
            echo "Deployment cancelled"
            exit 0
        fi
        ;;
        
    3)
        echo "Deployment cancelled"
        exit 0
        ;;
        
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}📋 DEPLOYMENT COMMANDS:${NC}"
echo "# Commit and deploy to Render"
echo "git add ."
echo "git commit -m \"🚀 Deploy Chat API V2 - Modular architecture\""
echo "git push origin main"
echo ""
echo "# Test the deployment"
echo "curl -X POST https://lucine-chatbot.onrender.com/api/chat/health"
echo ""
echo -e "${GREEN}✅ Ready for Git deployment!${NC}"