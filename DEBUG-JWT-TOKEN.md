# 🔐 DEBUG JWT TOKEN - 403 Error on take-chat

## Problem
Dashboard shows: `❌ Failed to take chat: Error: Token non valido`
Browser console error: `403 Forbidden` on `/api/operators/take-chat`

---

## Investigation Steps

### 1. **Check Token in Browser**
```javascript
// In browser console (dashboard)
const token = localStorage.getItem('auth_token');
console.log('Token:', token);
console.log('Token length:', token?.length);

// Decode token (without verification)
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log('Payload:', payload);
console.log('Expires:', new Date(payload.exp * 1000));
```

### 2. **Test Token Manually**
```bash
# Get token from browser localStorage
TOKEN="your_token_here"

# Test take-chat endpoint
curl -X POST https://lucine-chatbot.onrender.com/api/operators/take-chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Session-ID: test-session" \
  -d '{"sessionId":"test-session","operatorId":"4d43f3ec-e041-470e-90e0-e1657148d26e"}' \
  -v
```

### 3. **Check Middleware Flow**
```javascript
// middleware/security.js - authenticateToken flow:

1. Extract token from header
   → authHeader: "Bearer xyz..."
   → token: "xyz..."

2. Verify JWT
   → TokenManager.verifyToken(token)
   → If invalid → 403 "Token non valido"

3. Check operator in DB
   → prisma.operator.findUnique()
   → If not found → 401 "Operatore non valido"

4. Attach to req.user
   → req.user = operator
   → next()
```

---

## Common Causes

### **Cause 1: Token Expired (24h)**
**Symptom**: Token was valid, now returns 403
**Solution**: Re-login to get fresh token
```javascript
// Check expiry
const payload = JSON.parse(atob(token.split('.')[1]));
const now = Date.now() / 1000;
console.log('Expired?', payload.exp < now);
```

### **Cause 2: Wrong JWT Secret**
**Symptom**: Token always invalid
**Check**:
```bash
# On Render dashboard
echo $JWT_SECRET

# Should match what was used to generate token
```

### **Cause 3: Prisma Not Injected**
**Symptom**: `prisma is not defined` in middleware
**Check**: server.js line 250
```javascript
setPrismaClient(prisma); // Must be called
```

### **Cause 4: Operator Deactivated**
**Symptom**: Token valid but operator check fails
**Check**:
```sql
-- In database
SELECT id, username, isActive FROM Operator
WHERE id = '4d43f3ec-e041-470e-90e0-e1657148d26e';
```

### **Cause 5: CORS Preflight Failing**
**Symptom**: OPTIONS request fails before POST
**Check**: Browser Network tab → OPTIONS request status

---

## Debug Additions

### Add to `middleware/security.js`
```javascript
export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // DEBUG LOG
    console.log('🔐 Auth attempt:', {
        hasHeader: !!authHeader,
        hasToken: !!token,
        tokenPreview: token?.substring(0, 20) + '...',
        url: req.url,
        method: req.method
    });

    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({
            error: 'Token di accesso richiesto',
            code: 'MISSING_TOKEN'
        });
    }

    try {
        const decoded = TokenManager.verifyToken(token);
        console.log('✅ Token decoded:', { operatorId: decoded.operatorId, exp: decoded.exp });

        const operator = await prisma.operator.findUnique({
            where: {
                id: decoded.operatorId,
                isActive: true
            },
            select: {
                id: true,
                username: true,
                name: true,
                isActive: true,
                isOnline: true
            }
        });

        if (!operator) {
            console.log('❌ Operator not found or inactive:', decoded.operatorId);
            return res.status(401).json({
                error: 'Operatore non valido o disattivato',
                code: 'INVALID_OPERATOR'
            });
        }

        console.log('✅ Operator authenticated:', operator.username);
        req.user = operator;
        req.token = decoded;
        next();

    } catch (error) {
        console.error('❌ Token verification failed:', {
            error: error.message,
            tokenPreview: token?.substring(0, 20) + '...'
        });
        return res.status(403).json({
            error: 'Token non valido',
            code: 'INVALID_TOKEN',
            details: error.message // DEBUG only
        });
    }
};
```

---

## Quick Fix

### **If Token Expired** → Re-login
1. Logout from dashboard
2. Login again
3. New token generated (24h expiry)

### **If Middleware Issue** → Check Logs
```bash
# On Render dashboard
View Logs → Search for "🔐 Auth attempt"
```

### **If Persistent** → Force Token Refresh
```javascript
// In dashboard.js - Add refresh token logic
async refreshToken() {
    try {
        const response = await fetch(`${this.apiBase}/operators/refresh`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            }
        });
        const data = await response.json();
        if (data.token) {
            this.authToken = data.token;
            localStorage.setItem('auth_token', data.token);
        }
    } catch (error) {
        console.error('Token refresh failed:', error);
        this.logout();
    }
}
```

---

## Testing Script

```bash
#!/bin/bash
# test-jwt-token.sh

echo "🔐 Testing JWT Token..."

# 1. Login and get token
echo "1. Getting fresh token..."
RESPONSE=$(curl -s -X POST https://lucine-chatbot.onrender.com/api/operators/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"'${ADMIN_PASSWORD}'"}')

TOKEN=$(echo $RESPONSE | jq -r '.token')
OPERATOR_ID=$(echo $RESPONSE | jq -r '.operator.id')

echo "Token: ${TOKEN:0:50}..."
echo "Operator ID: $OPERATOR_ID"

# 2. Test authenticated endpoint
echo ""
echo "2. Testing take-chat with token..."
curl -X POST https://lucine-chatbot.onrender.com/api/operators/take-chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Session-ID: test-session-123" \
  -d "{\"sessionId\":\"test-session-123\",\"operatorId\":\"$OPERATOR_ID\"}" \
  -v
```

---

## Expected vs Actual

### **Expected (Success)**
```
POST /api/operators/take-chat
Authorization: Bearer eyJhbGc...
→ 200 OK
{
  "success": true,
  "chatId": "...",
  "operator": "..."
}
```

### **Actual (Error)**
```
POST /api/operators/take-chat
Authorization: Bearer eyJhbGc...
→ 403 Forbidden
{
  "error": "Token non valido",
  "code": "INVALID_TOKEN"
}
```

---

## Solution Checklist

- [ ] Check token exists in localStorage
- [ ] Verify token not expired (check `exp` claim)
- [ ] Test token with curl command
- [ ] Check server logs for auth errors
- [ ] Verify JWT_SECRET matches on Render
- [ ] Check operator `isActive: true` in DB
- [ ] Try re-login to get fresh token
- [ ] Add debug logs to middleware
- [ ] Check CORS preflight (OPTIONS request)
- [ ] Verify prisma injected in middleware

---

## Next Steps

1. **Immediate**: User should logout and re-login
2. **Debug**: Add console logs to middleware
3. **Long-term**: Implement token refresh endpoint
4. **Monitor**: Track token expiry in dashboard

---

*Created: 2025-10-01*
*Status: Investigating*
