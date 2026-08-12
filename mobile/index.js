// App entry.
//
// Plain re-export now. This file previously registered a
// react-native-track-player playback service, which had to run before the
// router evaluated — that library is gone (it does not compile against RN 0.86),
// and expo-audio's media session is managed by its own native foreground
// service, so there is nothing to register from JS.
require('expo-router/entry')
