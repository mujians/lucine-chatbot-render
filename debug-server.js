#!/usr/bin/env node
/**
 * 🔍 Server Diagnostic Tool
 * Quick diagnostic script to test server functionality
 */

import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// Simple diagnostic routes
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: process.uptime()
    });
});

app.get('/test-static', (req, res) => {
    const dashboardPath = path.join(process.cwd(), 'public/dashboard');
    const cssPath = path.join(dashboardPath, 'css/dashboard.css');
    const jsPath = path.join(dashboardPath, 'js/dashboard.js');
    
    const stats = {
        dashboardDir: fs.existsSync(dashboardPath),
        cssFile: fs.existsSync(cssPath) ? fs.statSync(cssPath).size : 'missing',
        jsFile: fs.existsSync(jsPath) ? fs.statSync(jsPath).size : 'missing',
        workingDir: process.cwd()
    };
    
    res.json(stats);
});

// Test static serving
app.use('/dashboard', express.static('public/dashboard'));

app.get('/', (req, res) => {
    res.send(`
        <h1>🔍 Server Diagnostics</h1>
        <ul>
            <li><a href="/ping">Ping Test</a></li>
            <li><a href="/test-static">Static File Test</a></li>
            <li><a href="/dashboard/">Dashboard Test</a></li>
        </ul>
    `);
});

app.listen(PORT, () => {
    console.log(`🔍 Diagnostic server running on port ${PORT}`);
    console.log(`📂 Working directory: ${process.cwd()}`);
    console.log(`🌐 Test at: http://localhost:${PORT}`);
});