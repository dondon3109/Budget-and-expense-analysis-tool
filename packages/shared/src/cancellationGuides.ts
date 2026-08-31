export interface CancellationGuide {
  id: string;
  name: string;
  aliases: string[];
  category: "philippines" | "streaming" | "software" | "app_stores" | "gaming" | "general";
  directUrl?: string;
  summary: string;
  cutoffWarning: string;
  steps: string[];
}

export const CANCELLATION_GUIDES: CancellationGuide[] = [
  // Philippine Services & Wallets
  {
    id: "gcash",
    name: "GCash AutoPay & Linked Accounts",
    aliases: ["gcash", "g-cash", "gcash autopay", "alipay"],
    category: "philippines",
    directUrl: "https://www.gcash.com",
    summary: "Manage and cancel active subscriptions, recurring merchant authorizations, and AutoPay debits inside the GCash app.",
    cutoffWarning: "Cancel at least 24 hours before your billing date to prevent pre-authorized wallet deductions.",
    steps: [
      "Open the GCash app and tap 'Profile' at the bottom right.",
      "Go to 'Settings' > 'Linked Accounts' or 'AutoPay / Subscriptions'.",
      "Locate the active merchant or subscription service (e.g. Google, Spotify, Netflix).",
      "Tap the merchant and select 'Cancel AutoPay' or 'Unlink Account'.",
      "Confirm cancellation to revoke authorization.",
    ],
  },
  {
    id: "maya",
    name: "Maya Subscriptions & Auto-Debit",
    aliases: ["maya", "paymaya", "maya wallet"],
    category: "philippines",
    directUrl: "https://www.maya.ph",
    summary: "Revoke recurring subscriptions, virtual card debits, and authorized merchants in Maya.",
    cutoffWarning: "Cancel recurring authorizations at least 24 hours prior to billing to prevent card pre-holds.",
    steps: [
      "Open the Maya app and navigate to 'Cards' or 'Profile' settings.",
      "Check 'Active Subscriptions' or 'Manage Recurring Payments'.",
      "Select the merchant you wish to cancel.",
      "Tap 'Deauthorize' or 'Block Recurring Payments'.",
      "Alternatively, freeze or regenerate your Maya Virtual Card to stop stubborn debits.",
    ],
  },
  {
    id: "globe",
    name: "Globe Postpaid & Lifestyle Add-ons",
    aliases: ["globe", "globe telecom", "globe postpaid", "globeone"],
    category: "philippines",
    directUrl: "https://www.globe.com.ph",
    summary: "Cancel recurring lifestyle addons, entertainment subscriptions (Viu, Disney+, Netflix), and data boosters.",
    cutoffWarning: "Add-ons billed on your monthly cutoff cycle should be canceled 48 hours before billing cut-off.",
    steps: [
      "Open the GlobeOne app and select your postpaid account.",
      "Go to 'Subscriptions' or 'Content Add-ons'.",
      "Select the active subscription (e.g. Disney+, Spotify, Prime Video).",
      "Tap 'Unsubscribe' or 'Cancel Add-on' and confirm via SMS OTP.",
    ],
  },
  {
    id: "smart",
    name: "Smart Postpaid & Content Subscriptions",
    aliases: ["smart", "smart communications", "smart postpaid", "giga life", "smart giga"],
    category: "philippines",
    directUrl: "https://smart.com.ph",
    summary: "Cancel entertainment packages, postpaid recurring add-ons, and value-added services on Smart.",
    cutoffWarning: "Cancel at least 2 days prior to your monthly plan cutoff date.",
    steps: [
      "Open the Smart GigaLife / Smart App.",
      "Go to your account dashboard and tap 'Active Subscriptions / VAS'.",
      "Find the third-party subscription or add-on.",
      "Tap 'Opt-out' or text the specific STOP keyword (e.g., 'STOP <KEYWORD>') to the provider's shortcode.",
    ],
  },

  // App Stores & Ecosystems
  {
    id: "apple",
    name: "Apple App Store (iOS & iCloud)",
    aliases: ["apple", "icloud", "app store", "apple music", "apple tv", "apple one", "itunes"],
    category: "app_stores",
    directUrl: "https://finance-app.itunes.apple.com/account/subscriptions",
    summary: "Cancel subscriptions billed through your Apple ID / App Store account.",
    cutoffWarning: "Apple requires cancellation at least 24 hours before renewal date to avoid automatic billing.",
    steps: [
      "Open 'Settings' on your iPhone or iPad.",
      "Tap your Name / Apple ID profile at the top.",
      "Tap 'Subscriptions'.",
      "Choose the subscription you want to manage.",
      "Tap 'Cancel Subscription' (or 'Cancel Free Trial') and confirm.",
    ],
  },
  {
    id: "google_play",
    name: "Google Play Store & Google One",
    aliases: ["google play", "google one", "google storage", "play store", "android subscription"],
    category: "app_stores",
    directUrl: "https://play.google.com/store/account/subscriptions",
    summary: "Manage and cancel Android app subscriptions and Google One storage plans.",
    cutoffWarning: "Cancel before your renewal cycle begins; benefits remain active until the end of the paid period.",
    steps: [
      "Open the Google Play Store app or visit play.google.com/store/account/subscriptions.",
      "Tap your profile icon at top right > 'Payments & subscriptions' > 'Subscriptions'.",
      "Select the subscription you want to cancel.",
      "Tap 'Cancel subscription' and follow on-screen reason prompts.",
    ],
  },

  // Streaming & Entertainment
  {
    id: "netflix",
    name: "Netflix",
    aliases: ["netflix"],
    category: "streaming",
    directUrl: "https://www.netflix.com/youraccount",
    summary: "Cancel your Netflix streaming membership online with immediate confirmation.",
    cutoffWarning: "You can watch until your billing period ends. No partial refund is issued.",
    steps: [
      "Sign in to your account on Netflix.com.",
      "Click your profile icon at the top right > 'Account'.",
      "Under the 'Membership & Billing' section, click 'Cancel Membership'.",
      "Click 'Finish Cancellation' to confirm.",
    ],
  },
  {
    id: "spotify",
    name: "Spotify Premium",
    aliases: ["spotify", "spotify premium", "spotify family", "spotify duo"],
    category: "streaming",
    directUrl: "https://www.spotify.com/account/overview/",
    summary: "Cancel Spotify Premium renewal and switch to Spotify Free.",
    cutoffWarning: "Premium stays active until your next billing date. If billed through GCash/Apple, cancel through that provider.",
    steps: [
      "Log in to spotify.com/account on a web browser.",
      "Under 'Your plan', click 'Change plan'.",
      "Scroll down to 'Cancel Spotify' and click 'Cancel Premium'.",
      "Continue through the confirmation pages until you see the cancellation timestamp.",
    ],
  },
  {
    id: "youtube_premium",
    name: "YouTube Premium & Music",
    aliases: ["youtube", "youtube premium", "youtube music", "yt premium"],
    category: "streaming",
    directUrl: "https://www.youtube.com/paid_memberships",
    summary: "Cancel YouTube Premium or YouTube Music memberships.",
    cutoffWarning: "Cancel before your renewal date. Access continues until the end of your billing cycle.",
    steps: [
      "Go to youtube.com/paid_memberships.",
      "Click 'Manage membership' next to YouTube Premium.",
      "Click 'Deactivate' > 'Continue to cancel'.",
      "Select your reason and confirm cancellation.",
    ],
  },
  {
    id: "disney_plus",
    name: "Disney+",
    aliases: ["disney+", "disney plus", "disney"],
    category: "streaming",
    directUrl: "https://www.disneyplus.com/account",
    summary: "Cancel your Disney+ subscription.",
    cutoffWarning: "If subscribed through Globe or Apple/Google, cancel via that provider's portal.",
    steps: [
      "Log in to DisneyPlus.com in a web browser.",
      "Select your Profile > 'Account'.",
      "Under 'Subscription', select your plan.",
      "Select 'Cancel Subscription' and confirm.",
    ],
  },

  // Software & Productivity
  {
    id: "adobe",
    name: "Adobe Creative Cloud",
    aliases: ["adobe", "creative cloud", "photoshop", "illustrator", "lightroom", "acrobat"],
    category: "software",
    directUrl: "https://account.adobe.com/plans",
    summary: "Cancel Adobe Creative Cloud or individual Adobe plans.",
    cutoffWarning: "Warning: Annual plans paid monthly may incur early termination fees if canceled after the initial 14-day refund window.",
    steps: [
      "Sign in to account.adobe.com/plans.",
      "Select 'Manage plan' for the plan you want to cancel.",
      "Select 'Cancel your plan'.",
      "Review potential fee notices, select your reason, and click 'Continue' through to confirmation.",
    ],
  },
  {
    id: "canva",
    name: "Canva Pro",
    aliases: ["canva", "canva pro", "canva teams"],
    category: "software",
    directUrl: "https://www.canva.com/settings/billing-and-plans",
    summary: "Cancel Canva Pro or Canva Teams subscription renewal.",
    cutoffWarning: "Cancel before renewal. Your designs and brand assets remain intact in the Free plan.",
    steps: [
      "Log in to Canva.com and click the gear icon (Settings) in top right.",
      "Click 'Billing & plans' on the left sidebar.",
      "Under 'Subscriptions for your team / personal', click the three dots (...).",
      "Select 'Cancel subscription' and confirm.",
    ],
  },
  {
    id: "chatgpt",
    name: "OpenAI ChatGPT Plus / Pro",
    aliases: ["chatgpt", "openai", "chatgpt plus", "chatgpt pro"],
    category: "software",
    directUrl: "https://chatgpt.com/#settings/Subscription",
    summary: "Cancel ChatGPT Plus or Pro subscription renewal.",
    cutoffWarning: "You retain access until your current monthly billing period ends.",
    steps: [
      "Log in to chatgpt.com.",
      "Click your profile icon at bottom left > 'Settings'.",
      "Click 'Subscription' or 'My Plan'.",
      "Click 'Manage my subscription' (redirects to Stripe portal).",
      "Click 'Cancel plan' and confirm.",
    ],
  },
  {
    id: "amazon_prime",
    name: "Amazon Prime / Prime Video",
    aliases: ["amazon", "prime", "amazon prime", "prime video"],
    category: "streaming",
    directUrl: "https://www.amazon.com/mc/manage",
    summary: "End Amazon Prime or Prime Video membership.",
    cutoffWarning: "If you haven't used Prime benefits during the billing cycle, you may be eligible for a full/partial refund.",
    steps: [
      "Go to 'Your Account' on Amazon.com > 'Prime Membership'.",
      "Click 'Update, cancel and more' under Manage Membership.",
      "Click 'End Membership' and follow prompts to confirm.",
    ],
  },
  {
    id: "github",
    name: "GitHub Copilot / Pro",
    aliases: ["github", "github copilot", "github pro"],
    category: "software",
    directUrl: "https://github.com/settings/billing",
    summary: "Cancel GitHub Copilot or paid GitHub user plan.",
    cutoffWarning: "Active features continue until the end of your prepaid billing term.",
    steps: [
      "Go to github.com/settings/billing.",
      "Under 'Plans and usage' or 'Add-ons', find Copilot or your paid tier.",
      "Click 'Edit' or three dots > 'Cancel subscription'.",
      "Follow the prompts to confirm downgrade to Free.",
    ],
  },
];

export function findCancellationGuide(subscriptionName: string): CancellationGuide | null {
  if (!subscriptionName || !subscriptionName.trim()) return null;
  const normalized = subscriptionName.trim().toLowerCase();

  // 1. Exact or alias match
  for (const guide of CANCELLATION_GUIDES) {
    if (guide.id === normalized || guide.name.toLowerCase() === normalized) {
      return guide;
    }
    if (guide.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
      return guide;
    }
  }

  // 2. Tokenized word overlap
  const tokens = normalized.split(/[\s\-_.,/]+/).filter((t) => t.length > 2);
  for (const guide of CANCELLATION_GUIDES) {
    for (const alias of guide.aliases) {
      if (tokens.some((token) => alias.includes(token))) {
        return guide;
      }
    }
  }

  return null;
}
