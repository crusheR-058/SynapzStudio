// Custom entry so the playback service is registered BEFORE the app loads.
//
// react-native-track-player requires registerPlaybackService to run at the top
// level of the entry file — not from a component, not inside an effect. If the
// OS restarts the app to deliver a lockscreen button press, this is the only
// code guaranteed to have run.
//
// package.json's "main" points here instead of straight at expo-router/entry.
//
// Both statements are require(), NOT import. ES imports are hoisted: written as
// `import 'expo-router/entry'` at the bottom, the router would still evaluate
// first and the service would register too late — intermittently, and only on
// the cold start that a lockscreen press triggers, which is the hardest possible
// case to reproduce. require() executes in source order.

const TrackPlayer = require('react-native-track-player').default

// .default because playbackService.ts is an ES module — passing the module
// namespace object instead of the function makes registration fail silently.
TrackPlayer.registerPlaybackService(() => require('./src/lib/playbackService').default)

require('expo-router/entry')
