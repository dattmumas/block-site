// The App Store ID and the App Store Connect provider token, in one place.
// Set at launch (5 Nov 2026) with:
//   python3 tools/site/set_app_id.py <app id> <provider token>
// That also turns the smart-app-banner comment in each page head into Apple's banner tag.
// badge: the path of Apple's official "Download on the App Store" badge file, once the
// owner adds it to the site (for example "/assets/img/app-store-badge.svg"). Never draw it.
// Every store call to action (site.js, and build.py for the links without JavaScript) and the /code/ page read this file.
window.BLOCK = { appId: "6819938680", providerToken: "129571361", badge: null };
