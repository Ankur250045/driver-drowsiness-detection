# Driver Drowsiness Detection System

## Overview

This is a real-time, browser-based driver drowsiness detection system that uses AI-powered facial landmark analysis to monitor driver alertness and prevent accidents. The application processes video streams entirely in the browser using TensorFlow.js and MediaPipe Face Mesh, ensuring complete privacy with no data transmission to external servers.

The system analyzes Eye Aspect Ratio (EAR) for eye closure detection and Mouth Aspect Ratio (MAR) for yawning detection, triggering visual and audio alerts when drowsiness is detected. It features a calibration system for personalized thresholds and tunable parameters for different sensitivity levels.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React with TypeScript for UI components
- Vite as the build tool and development server
- TailwindCSS with shadcn/ui component library for styling
- Wouter for client-side routing

**Component Structure:**
- Single-page application (SPA) design with main route at `/`
- Component-based architecture using React functional components with hooks
- UI components follow the shadcn/ui pattern with Radix UI primitives
- Custom components for drowsiness detection features:
  - `CameraFeed`: Manages webcam access and video streaming
  - `StatusDashboard`: Displays real-time detection metrics
  - `SettingsPanel`: Controls for threshold adjustment
  - `AlertOverlay`: Full-screen critical alert display
  - `CalibrationModal`: User calibration interface
  - `DebugToggle`: Developer debugging tools

**State Management:**
- React hooks (`useState`, `useRef`, `useEffect`, `useCallback`) for local component state
- TanStack Query (React Query) for server state management (though minimal backend interaction)
- No global state management library - state colocated with components

**Design System:**
- Dark mode theme with teal/indigo accent colors
- CSS custom properties for theming
- Responsive layout: two-column on desktop (camera + dashboard), stacked on mobile (<700px)
- Inter font family for UI, JetBrains Mono for monospaced metrics

### Backend Architecture

**Minimal Express Server:**
- Node.js with Express framework
- Primary purpose: serve static frontend assets in production
- Vite middleware integration in development mode
- No active API endpoints currently implemented
- Storage interface defined but using in-memory implementation (no persistence)

**Rationale:** The application is designed to run entirely client-side for privacy and performance. The backend exists primarily for deployment infrastructure rather than application logic.

### AI/ML Detection System

**Face Detection:**
- TensorFlow.js with WebGL backend for browser-based inference
- MediaPipe Face Mesh model for 468 facial landmark detection
- Client-side processing ensures no video data leaves the user's device

**Detection Algorithms:**
1. **Eye Aspect Ratio (EAR)**: Calculates eye openness using vertical/horizontal distance ratios of eye landmarks
   - Default threshold: 0.23
   - Triggers drowsy state when eyes closed for 15+ consecutive frames (~0.5s at 30fps)

2. **Mouth Aspect Ratio (MAR)**: Detects yawning using mouth opening measurements
   - Default threshold: 0.6
   - Triggers drowsy state when mouth open for 10+ consecutive frames

3. **Status States**: 
   - Alert (normal)
   - Drowsy (warning)
   - Critical (immediate action required)

**Audio Alerts:**
- Web Audio API for browser-based alarm sounds
- Sine wave oscillator at 800Hz with pulsing gain envelope
- No external audio files required

### Data Flow

1. User grants camera permission → MediaStream API captures video
2. Video frames processed by TensorFlow.js Face Mesh detector
3. Facial landmarks extracted and used to calculate EAR/MAR
4. Frame-based counters track consecutive drowsy detections
5. State updates trigger UI changes and audio alerts
6. Calibration mode collects baseline measurements for personalized thresholds

### Privacy & Performance Considerations

**Privacy-First Design:**
- All processing happens in-browser
- No video data sent to servers
- No user data storage or tracking
- LocalStorage not used (settings reset on refresh)

**Performance Optimizations:**
- RequestAnimationFrame for efficient frame processing
- WebGL-accelerated TensorFlow.js inference
- Lazy loading of TensorFlow models
- FPS monitoring for performance debugging

## External Dependencies

### Core AI/ML Libraries
- **TensorFlow.js** (`@tensorflow/tfjs`): Browser-based machine learning framework with WebGL acceleration
- **Face Landmarks Detection** (`@tensorflow-models/face-landmarks-detection`): Pre-trained MediaPipe Face Mesh model for facial landmark detection
- **MediaPipe Face Mesh**: External CDN-hosted solution path for the detection model

### UI Framework & Components
- **React** (v18+): UI library with hooks
- **Radix UI**: Headless component primitives for accessible UI components (accordion, dialog, slider, toast, etc.)
- **shadcn/ui**: Component library built on Radix UI with TailwindCSS styling
- **TailwindCSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **class-variance-authority & clsx**: Utility for conditional CSS classes

### Build Tools & Development
- **Vite**: Frontend build tool and dev server
- **TypeScript**: Type-safe JavaScript
- **PostCSS & Autoprefixer**: CSS processing
- **ESBuild**: Fast JavaScript bundler for production builds
- **Wouter**: Lightweight client-side routing

### State Management & Data Fetching
- **TanStack Query** (`@tanstack/react-query`): Server state management (configured but minimally used)

### Forms & Validation
- **React Hook Form**: Form state management
- **Zod** (`@hookform/resolvers`): Schema validation for settings

### Backend (Minimal Usage)
- **Express**: Web server framework
- **Drizzle ORM** with **Neon Database** (PostgreSQL): Database setup present but not actively used for detection features
- **connect-pg-simple**: PostgreSQL session store (configured but not required for core functionality)

### Additional Libraries
- **date-fns**: Date manipulation utilities
- **nanoid**: Unique ID generation
- **Vaul**: Drawer component primitive

### Development Dependencies
- **tsx**: TypeScript execution for development
- **@replit/vite-plugin-***: Replit-specific development tools and debugging

### Browser APIs (No External Dependencies)
- **getUserMedia**: Camera access
- **Web Audio API**: Sound generation for alerts
- **RequestAnimationFrame**: Smooth frame processing
- **Canvas API**: Video frame manipulation (if needed)