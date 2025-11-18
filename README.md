# Driver Drowsiness Detection System

A real-time driver drowsiness detection web application using AI-powered face landmark analysis. Monitor alertness with Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR) detection to prevent accidents.

## Features

- **Real-time Face Detection** - Uses TensorFlow.js MediaPipe Face Mesh for accurate facial landmark detection
- **Drowsiness Monitoring** - Tracks eye closure (EAR) and yawning (MAR) patterns
- **Visual & Audio Alerts** - Critical alerts with pulsing red overlay and alarm sound
- **Calibration System** - Personalized threshold adjustment for different users
- **Tunable Parameters** - Adjust detection sensitivity with easy-to-use sliders
- **Privacy-First** - All processing happens locally in the browser, no data transmission
- **Responsive Design** - Works on desktop and mobile devices
- **Debug Mode** - Real-time FPS and metric visualization

## Quick Start

### Running on Replit

1. Open the Replit preview
2. **Important**: If camera permissions are blocked, click "Open in new tab" in the preview window
3. Allow camera access when prompted
4. The app will automatically start detecting drowsiness

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5000 in your browser
```

## How It Works

### Detection Algorithm

1. **Eye Aspect Ratio (EAR)**
   - Measures eye openness using facial landmarks
   - Default threshold: 0.23
   - Triggers drowsy alert when eyes are closed for 15+ consecutive frames (~0.5 seconds)

2. **Mouth Aspect Ratio (MAR)**
   - Detects yawning by measuring mouth opening
   - Default threshold: 0.6
   - Triggers drowsy alert when yawning detected for 10+ consecutive frames

3. **Status Levels**
   - **Alert** (Green): Normal driving state
   - **Drowsy** (Yellow): Warning - half the critical threshold reached
   - **Critical** (Red): Drowsiness detected - immediate action required

### Calibration

1. Click the "Calibrate" button in the settings panel
2. Look directly at the camera with eyes normally open for 3 seconds
3. The system will automatically adjust thresholds based on your baseline measurements
4. Recommended for users with glasses or different eye shapes

## User Interface

### Camera Feed
- Live video preview with status-based border colors
- Pulses red when critical drowsiness is detected
- Shows calibration overlay during calibration process

### Status Dashboard
- Current driver status (Alert/Drowsy/Critical)
- Real-time EAR and MAR values
- Optional FPS counter in debug mode

### Settings Panel
- **EAR Threshold**: Adjust eye closure sensitivity (0.1 - 0.5)
- **EAR Consecutive Frames**: Set frames required for alert (5 - 60)
- **MAR Threshold**: Adjust yawn detection sensitivity (0.3 - 1.0)
- **MAR Consecutive Frames**: Set frames required for alert (5 - 60)
- **Calibrate**: Start personalized calibration
- **Mute/Unmute**: Control audio alarm
- **Reset**: Restore default settings

### Debug Mode
Click the bug icon in the bottom-right corner to toggle debug mode and see:
- Real-time frame rate (FPS)
- Current EAR/MAR values
- Detection performance metrics

## Tuning Guidelines

### For Different Users

**Wearing Glasses:**
- Lower EAR threshold to 0.20-0.21
- Use calibration for best results

**Heavy Eyelids:**
- Increase EAR threshold to 0.25-0.27
- Adjust consecutive frames to 20-25

**High Sensitivity:**
- Lower both EAR threshold (0.21) and consecutive frames (10-12)
- May result in more false positives but better safety

**Low Sensitivity:**
- Increase consecutive frames to 20-30
- Keep thresholds at default values

### Performance Optimization

The app runs at a target of 15-30 FPS for optimal performance:
- Lower-end devices: ~15 FPS (still effective)
- Modern devices: 25-30 FPS (smooth detection)

## Browser Compatibility

### Recommended Browsers
- Chrome/Edge (Desktop): Full support
- Firefox (Desktop): Full support
- Safari (Desktop): Limited camera support

### Mobile Browsers
- Chrome (Android): Works with "Open in new tab"
- Safari (iOS): Limited MediaPipe support

## Privacy & Security

- **No Server Processing**: All detection runs in your browser
- **No Data Collection**: Video frames never leave your device
- **No Storage**: No recordings or personal data stored
- **Open Source**: Transparent, auditable code

## Technical Details

### Technologies Used
- **Frontend**: React + TypeScript
- **ML Model**: TensorFlow.js + MediaPipe Face Mesh
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

### Detection Parameters
```typescript
Default Settings:
- EAR Threshold: 0.23
- EAR Consecutive Frames: 15 (0.5s at 30 FPS)
- MAR Threshold: 0.6
- MAR Consecutive Frames: 10 (0.33s at 30 FPS)
```

### Face Landmark Indices
- Eye landmarks: Points 33, 133, 144, 153, 158, 160 (left), 263, 362, 373, 380, 385, 387 (right)
- Mouth landmarks: Points 13, 14, 78, 308

## Troubleshooting

### Camera Not Working
1. Check browser permissions (Settings → Privacy → Camera)
2. Ensure no other apps are using the camera
3. Try opening in a new tab/window
4. Refresh the page

### Model Loading Slowly
- First load downloads ~10MB of ML models
- Subsequent loads use browser cache
- Check internet connection

### High False Positive Rate
- Run calibration
- Increase consecutive frames threshold
- Adjust EAR/MAR thresholds higher

### Low Sensitivity
- Run calibration
- Lower EAR threshold to 0.21-0.22
- Decrease consecutive frames to 10-12

## Safety Notice

This system is designed to **assist** drivers in monitoring drowsiness, not replace safe driving practices:

⚠️ **Not a Replacement for Rest**: If you feel tired, pull over and rest
⚠️ **Supplementary Tool**: Use alongside good judgment and regular breaks
⚠️ **Regular Calibration**: Recalibrate when changing drivers or conditions

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Support

For issues or questions:
- Check the Troubleshooting section
- Review browser compatibility
- Ensure proper lighting conditions

---

**Stay Alert, Stay Safe** 🚗💤
