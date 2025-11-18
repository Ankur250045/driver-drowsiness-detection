# Driver Drowsiness Detection App - Design Guidelines

## Design Approach
**Utility-First Safety Interface** - This is a critical safety monitoring tool requiring clear visual hierarchy, instant readability, and minimal distraction. Design should prioritize functional clarity over decorative elements.

## Color System
**Theme**: Dark mode with teal/indigo accent
- **Background**: Soft charcoal/dark gray (#1a1a1a to #2d2d2d)
- **Primary Accent**: Teal (#0fb9b1) or Indigo (#4f46e5)
- **Text**: Light/white for high contrast
- **Status Colors**:
  - Alert/Normal: Green or primary color
  - Drowsy Warning: Yellow/amber (#f59e0b)
  - Critical Alert: Red (#ef4444)
- **Cards**: Slightly lighter than background with subtle shadows

## Layout Structure

### Desktop (Primary Target)
Two-column layout:
- **Left**: Live camera preview (640x480 or 16:9 aspect ratio)
- **Right**: Status dashboard card

### Mobile (<700px)
Stack vertically: camera preview on top, status card below

### Spacing System
Use Tailwind-equivalent units: **4, 8, 12, 16, 24** (1rem = 4 units)
- Card padding: 24 units (p-6)
- Section spacing: 16-24 units
- Element gaps: 8-12 units

## Typography
**Single font family** (system or Google Fonts):
- **Headings**: 24-32px, semi-bold (status labels, alerts)
- **Body/Metrics**: 16-18px, regular (EAR/MAR values)
- **Critical Alerts**: 28-36px, bold (drowsiness warnings)
- **Small Labels**: 14px, medium (button text, calibration)

High contrast required for safety - all text must be easily readable at a glance.

## Core Components

### Camera Preview
- Rounded corners (12px border-radius)
- Subtle border in primary color
- Pulse animation on border when drowsiness detected (2s loop, soft glow)

### Status Dashboard Card
- Rounded card (12px radius)
- Drop shadow (soft, elevated appearance)
- Real-time metrics display:
  - Current EAR value with small indicator
  - Current MAR value with small indicator
  - Status text (large, color-coded)
- Buttons: Calibrate, Mute Alarm, Reset/Snooze

### Alert System
- Full-width banner overlay when critical
- Red background with white text
- Text: "DROWSINESS DETECTED — PLEASE PULL OVER"
- Pulsing animation (subtle, not seizure-inducing)

### Calibration Modal
- Centered overlay with backdrop blur
- Simple instruction: "Look at the camera for 3 seconds"
- Progress indicator
- Semi-transparent dark background

### Control Buttons
- Primary: filled with primary color, white text
- Secondary: outline style
- Hover: translateY(-2px) + enhanced shadow
- Consistent padding: 12px horizontal, 8px vertical
- 8px border radius

## Animations (Minimal & Purposeful)
1. **Alert Pulse**: Border glow on camera feed (2s ease-in-out loop)
2. **Status Transition**: Fade/slide animation when status changes (300ms)
3. **Button Hover**: Lift effect with shadow (150ms)
4. **Critical Flash**: Red overlay flash (not strobe - gentle pulse)

No distracting animations during normal operation. All animations serve functional purpose.

## Debug Mode Toggle
Small floating toggle in corner to show:
- Real-time EAR/MAR values (monospace font)
- Frame rate counter
- Detection threshold indicators
- Minimal, non-intrusive overlay

## Accessibility
- High contrast ratios (WCAG AAA for critical text)
- Keyboard navigation for all controls
- ARIA labels for status indicators
- Large touch targets for mobile (48px minimum)
- Option to mute alarm but keep visual alerts

## Responsive Behavior
- Desktop: Side-by-side layout, full feature set
- Tablet: Maintain two-column if space allows
- Mobile: Stack vertically, ensure camera preview remains prominent

## Visual Hierarchy Priority
1. Camera feed (primary focus area)
2. Current status indicator (immediate recognition)
3. Alert messages (when triggered)
4. Metrics and controls (supporting information)

## Images
**No decorative images required** - this is a functional utility app. The only visual content is the live camera feed, which is the primary interface element.