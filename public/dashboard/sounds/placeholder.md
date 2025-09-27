# 🔊 Notification Sounds

This directory contains notification sound files for the dashboard:

- `new-chat.mp3` - Sound for new chat notifications
- `new-message.mp3` - Sound for new message notifications  
- `urgent.mp3` - Sound for urgent notifications
- `success.mp3` - Sound for success notifications

## Sound Requirements

- Format: MP3, OGG, or WAV
- Duration: 1-3 seconds recommended
- Volume: Moderate level (system will control volume)
- File size: < 50KB recommended for fast loading

## Adding Custom Sounds

1. Place sound files in this directory
2. Update the `sounds` object in `/js/notifications.js`
3. Ensure files are properly referenced in the service worker cache

## Default Behavior

If sound files are not found, the notification system will:
- Continue to work without audio
- Log warnings in the console
- Fall back to browser default notification sounds (if any)