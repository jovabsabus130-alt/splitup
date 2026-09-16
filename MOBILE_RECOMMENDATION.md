# SplitUp Mobile Architecture Evaluation & Technical Recommendation

**Date**: September 15, 2026  
**Scope**: Evaluation of Mobile Strategy for SplitUp (Capacitor vs. React Native / Expo)

---

## 1. Executive Summary

SplitUp currently has a modern, responsive single-page web frontend built with **React 19, Vite, and Vanilla CSS** with high mobile responsiveness, custom UI modals, QR payment integration, and a RESTful Express + PostgreSQL backend.

To expand SplitUp to mobile devices (Android APK and iOS), two primary architectural pathways exist:
1. **Option A**: Capacitor Wrapper around the existing React/Vite web application.
2. **Option B**: Separate React Native / Expo application consuming the existing Express backend.

---

## 2. Detailed Technical Comparison

| Evaluation Metric | Option A: Capacitor (Webview Wrapper) | Option B: React Native / Expo (Native Client) |
|---|---|---|
| **Development Time** | **Fastest (1–2 days)**. Uses the existing built Vite bundle with minimal bridge configuration. | **Moderate to Long (2–4 weeks)**. Entire UI, forms, split calculations, and navigation must be rewritten in React Native primitives (`<View>`, `<Text>`, `<FlatList>`). |
| **APK Generation** | **Direct & Streamlined**. Run `npx cap add android` and build signed APK/AAB via Android Studio or GitHub Actions. | **Streamlined via EAS Build**. Run `eas build -p android` (requires Expo cloud account or local build setup). |
| **UI & CSS Reuse** | **100% Code Reuse**. Reuses all existing pages (`DashboardPage`, `GroupDetailPage`, `AnalyticsPage`, `HistoryPage`), modals, and styling tokens. | **0% Direct CSS/DOM Reuse**. Web CSS and HTML elements are unsupported; all components must be rewritten using StyleSheet/Tailwind Native. |
| **Maintenance Overhead** | **Unified Codebase**. One single codebase for Web, Android, and iOS. Bug fixes and features update everywhere instantly. | **Dual Codebase Burden**. Every feature, validation rule, split mode, or notification handler must be built and maintained twice. |
| **Native Device Features** | **Full Support via Plugins**. Access Camera, File System, Push Notifications, Clipboard, Biometrics, and Haptics via `@capacitor/*` plugins. | **Full Native Support**. Native APIs via Expo modules and native bridge. |
| **Authentication Flow** | **Seamless**. Reuses existing JWT storage (`localStorage` / `@capacitor/preferences`) and cookie/header interception. | **Requires SecureStore**. Must adapt authentication tokens and session restoration to `expo-secure-store`. |
| **Push Notifications** | **Native FCM / APNs**. Supported via `@capacitor/push-notifications` directly hooked to SplitUp backend notification triggers. | **Native FCM / APNs**. Supported via `expo-notifications`. |
| **QR Code Scanning & UPI** | **Supported**. `@capacitor-community/barcode-scanner` for scanning group invite QRs / UPI payment intents. | **Supported**. `expo-camera` or `react-native-qrcode-scanner`. |
| **Offline Capabilities** | **Service Workers / IndexedDB**. Can cache offline transactions and group summaries via standard Web Storage and Service Workers. | **SQLite / WatermelonDB**. Can implement native offline cache. |
| **Performance & Feel** | **Fast & Smooth** on modern devices (hardware-accelerated WebViews with smooth CSS animations). | **Native 60/120 FPS**. Native UI component rendering. |
| **Long-Term Scalability** | Ideal for rapid iteration, single-team maintenance, web-mobile parity, and continuous web deployments. | Ideal if requiring complex 3D graphics, heavy native background processing, or widget extensions. |

---

## 3. Final Recommendation: Option A (Capacitor)

### Why Capacitor is the Recommended Choice for SplitUp:
1. **Single Source of Truth**: SplitUp already has extensive financial math, rounding handlers, split modes (Equal, Custom, Percentage, Fraction, Count), interactive charts, and concern workflows. With Capacitor, 100% of this business logic and UI remains unified.
2. **Immediate Time-to-Market**: Generating an Android APK with Capacitor takes minutes without rewriting hundreds of components.
3. **Identical Backend & Database**: Both approaches share the exact same Express REST API, Prisma database, and JWT authentication.
4. **Native Extensibility**: Whenever native device access is required (e.g. push notification alerts, camera receipt scanning, biometric login), official Capacitor plugins provide native bridging without abandoning the React frontend.

---

## 4. Next Steps When Ready to Build Mobile Client
- Add `@capacitor/core`, `@capacitor/cli`, and `@capacitor/android`.
- Configure `capacitor.config.json` with `appId: "com.splitup.app"` and `webDir: "dist"`.
- Run `npm run build` in `frontend/` followed by `npx cap sync`.
- Build release APK / AAB for deployment.
