/* ===== core/modules.js — specialised behaviour templates ===== */
const EMOTIONS = ["Stressed", "Anxious", "Bored", "Tired", "Restless", "Angry", "Sad", "Lonely", "Ashamed", "Overwhelmed", "Frustrated", "Excited"];
const OUTCOMES = [
  { key: "completed", label: "Did it", short: "Completed" },
  { key: "partial", label: "Partly", short: "Partial" },
  { key: "not_completed", label: "Not this time", short: "Not completed" }
];

const MODULES = {
  smoking: {
    name: "Smoking & nicotine", emoji: "🚬",
    blurb: "Cravings rise, peak and fall. Each craving you ride out is evidence that you don't need a cigarette to feel okay.",
    belief: "If I don't smoke now, the craving will keep getting worse and I won't be able to focus.",
    alternatives: ["Ride the craving out for 10–15 minutes without smoking", "Use fast-acting NRT (gum/spray/lozenge) instead", "Walk outside for 5 minutes and drink water", "Slow breathing: 4 seconds in, 6 seconds out, for 3 minutes"],
    triggers: ["Coffee", "After eating", "Work break", "Stress", "Alcohol", "Seeing others smoke", "Boredom", "Waking up"],
    labels: { urge: "Craving intensity right now", expected: "How bad will it get without smoking?", actual: "How bad did the craving actually get?", duration: "craving" },
    startFields: [{ key: "minutesSinceLast", label: "Minutes since your last cigarette", type: "number", min: 0, max: 100000, help: "Filled in from your last logged cigarette when known." }],
    endFields: [
      { key: "cravingPassed", label: "Did the craving pass without smoking?", type: "bool" },
      { key: "cigarettesAvoided", label: "Cigarettes avoided (if known)", type: "number", min: 0, max: 40, showIf: d => d.cravingPassed === true }
    ],
    resources: [
      "Quitting is not a willpower test. Nicotine replacement (a patch plus a fast-acting form) or prescription medication (varenicline, cytisine) from a doctor clearly improves your chances, especially combined with counselling.",
      "Germany: free quit-smoking phone line of the BIÖG, 0800 8 31 31 31 (Mon–Thu 10–22, Fri–Sun 10–18). Online programme: rauchfrei-info.de. Many Krankenkassen pay for quit courses.",
      "A slip is data, not failure. Log it, look at the trigger, and carry on. Your previous progress stays."
    ]
  },
  procrastination: {
    name: "Procrastination", emoji: "⏳",
    blurb: "Avoidance brings instant relief and teaches your brain the task is dangerous. Starting tiny tests that prediction.",
    belief: "Starting this will feel unbearable, so I'll do it later when I feel ready.",
    alternatives: ["Work on it for 5 minutes only, then decide", "Open the file and write the first ugly sentence", "Phone in another room, 25-minute timer", "Do the smallest physical first step"],
    triggers: ["Opening the laptop", "Unclear next step", "Phone nearby", "After lunch", "Big deadline", "Feeling tired"],
    labels: { urge: "Urge to avoid right now", expected: "How unpleasant will starting be?", actual: "How unpleasant was it actually?", duration: "unpleasant part" },
    startFields: [],
    endFields: [{ key: "minutesWorked", label: "Minutes actually worked", type: "number", min: 0, max: 1440 }],
    resources: ["Make the first step so small it feels silly. Momentum usually comes after starting, not before."]
  },
  exercise: {
    name: "Exercise & consistency", emoji: "🏋️",
    blurb: "Your brain predicts the effort, not the mood boost afterwards. Short sessions collect evidence fast.",
    belief: "Training today will be exhausting and not worth it.",
    alternatives: ["Go and do only 10 minutes, leave if I want", "Put on gym clothes and walk to the door", "Do one warm-up set at home", "10-minute walk instead of nothing"],
    triggers: ["After work", "Bad sleep", "Cold weather", "Sore muscles", "Busy day", "Morning alarm"],
    labels: { urge: "Resistance to training right now", expected: "How bad will the session feel?", actual: "How bad did it actually feel?", duration: "hard part" },
    startFields: [{ key: "moodBefore", label: "Mood right now (0 low – 10 great)", type: "number", min: 0, max: 10 }],
    endFields: [
      { key: "minutesTrained", label: "Minutes trained", type: "number", min: 0, max: 600 },
      { key: "moodAfter", label: "Mood afterwards (0 low – 10 great)", type: "number", min: 0, max: 10 }
    ],
    resources: ["Track the mood after, not just the effort. The before/after mood gap is your strongest evidence."]
  },
  spending: {
    name: "Spending & impulse buys", emoji: "💶",
    blurb: "The urge to buy peaks and fades. Waiting tests whether you'll really miss out.",
    belief: "If I don't buy this now, I'll regret it and keep thinking about it.",
    alternatives: ["Wait 24 hours, keep it in the cart", "Move the same amount into savings", "Ask: would I buy it at double the price?", "Delete the shopping app for a day"],
    triggers: ["Sale or discount", "Social media ad", "Bad mood", "Payday", "Boredom scrolling", "Late night"],
    labels: { urge: "Urge to buy right now", expected: "How bad will not buying feel?", actual: "How bad did it actually feel?", duration: "urge" },
    startFields: [{ key: "amount", label: "Price of the item", type: "money", min: 0, max: 100000 }],
    endFields: [{ key: "purchased", label: "Did you buy it in the end?", type: "bool" }],
    resources: []
  },
  emotional: {
    name: "Emotional reactions", emoji: "🌊",
    blurb: "Strong reactions feel permanent in the moment. Pausing shows you how quickly they change.",
    belief: "If I don't react right now, this feeling will take over.",
    alternatives: ["Name the feeling and wait 10 minutes before acting", "Slow breathing for 3 minutes", "Write what I want to say, don't send it yet", "Leave the room for a short walk"],
    triggers: ["Criticism", "Feeling ignored", "Plans changing", "Being tired or hungry", "Conflict", "Bad news"],
    labels: { urge: "Emotional intensity right now", expected: "How bad will it get if I don't react?", actual: "How bad did it actually get?", duration: "intense part" },
    startFields: [], endFields: [{ key: "reactedAnyway", label: "Did you react in the old way anyway?", type: "bool" }],
    resources: ["If emotions feel unmanageable often, a psychotherapist (Psychotherapeutische Sprechstunde in Germany) can help."]
  },
  social: {
    name: "Social anxiety", emoji: "🗣️",
    blurb: "Anxiety predicts judgement and embarrassment. Small social experiments test what people actually do.",
    belief: "If I speak up, people will think I'm awkward or stupid.",
    alternatives: ["Say one sentence in the conversation", "Ask a question at the shop or counter", "Make eye contact and greet someone", "Stay 10 minutes longer instead of leaving"],
    triggers: ["Group conversation", "Phone call", "New people", "Being watched", "Speaking up at work"],
    labels: { urge: "Anxiety right now", expected: "How bad will it get?", actual: "How bad did it actually get?", duration: "anxious part" },
    startFields: [], endFields: [{ key: "interactions", label: "Number of interactions you started", type: "number", min: 0, max: 100 }],
    resources: ["Drop safety behaviours (looking at your phone, rehearsing) during the experiment so the evidence counts."]
  },
  relationship: {
    name: "Relationships & communication", emoji: "💬",
    blurb: "Old reactions predict that honesty leads to conflict. Calm, small conversations test that.",
    belief: "If I say what I need, it will turn into a fight or they'll pull away.",
    alternatives: ["Calm 5-minute talk using 'I feel… I need…'", "Replay the trigger scene with a calm ending, then try it for real", "Pause, then ask a question instead of defending", "Send a short honest message"],
    triggers: ["Their tone", "Feeling criticised", "Silence / no reply", "Being late", "Jealousy", "Old argument topic"],
    labels: { urge: "Urge to defend / withdraw right now", expected: "How badly will the talk go?", actual: "How badly did it actually go?", duration: "tense part" },
    startFields: [], endFields: [{ key: "conversationHappened", label: "Did the conversation happen?", type: "bool" }],
    resources: ["This changes your reaction, not the other person's behaviour. For serious hurt or repeated conflict, a couples or individual therapist can help."]
  },
  career: {
    name: "Career development", emoji: "📄",
    blurb: "Applying feels like inviting rejection. Small, repeated steps test how bad it really is.",
    belief: "Applying is pointless, they'll reject me anyway.",
    alternatives: ["Send one application", "Improve one line of my CV", "Message one person about an opening", "Spend 15 minutes researching one company"],
    triggers: ["Seeing a job ad", "Rejection email", "Comparing with others", "Evening after work", "Unclear requirements"],
    labels: { urge: "Urge to avoid right now", expected: "How bad will it feel?", actual: "How bad did it actually feel?", duration: "hard part" },
    startFields: [], endFields: [{ key: "stepsDone", label: "Applications / career steps done", type: "number", min: 0, max: 50 }],
    resources: ["The Agentur für Arbeit offers free career and Ausbildung counselling (Berufsberatung)."]
  },
  productivity: {
    name: "Productivity & projects", emoji: "🛠️",
    blurb: "Side projects die from 'it won't matter anyway'. Short focused blocks test that belief.",
    belief: "Working on this won't make a difference, so it's not worth starting.",
    alternatives: ["One 15-minute focused block", "Finish one tiny visible piece", "Write tomorrow's single most important task", "Phone off for one block"],
    triggers: ["No clear plan", "Scrolling", "After work tiredness", "Feeling behind", "Perfectionism"],
    labels: { urge: "Urge to avoid right now", expected: "How unpleasant will it be?", actual: "How unpleasant was it actually?", duration: "unpleasant part" },
    startFields: [], endFields: [{ key: "minutesWorked", label: "Minutes of focused work", type: "number", min: 0, max: 1440 }],
    resources: []
  },
  routines: {
    name: "Personal routines", emoji: "🌱",
    blurb: "Routines feel like chores in advance and usually feel fine while doing them.",
    belief: "This routine is boring and a waste of time right now.",
    alternatives: ["Read for 10 minutes", "Clean for 5 minutes with a timer", "Do my skincare now", "Prepare tomorrow's clothes and bag"],
    triggers: ["Tired in the evening", "Phone in bed", "Messy room", "No fixed time", "Weekend"],
    labels: { urge: "Resistance right now", expected: "How unpleasant will it be?", actual: "How unpleasant was it actually?", duration: "unpleasant part" },
    startFields: [], endFields: [{ key: "routineMinutes", label: "Minutes spent on the routine", type: "number", min: 0, max: 600 }],
    resources: ["Attach the routine to something you already do every day (after brushing teeth, after coffee)."]
  },
  general: {
    name: "Custom", emoji: "⭐",
    blurb: "Your own experiment: name the old prediction, try the new action, compare.",
    belief: "", alternatives: [], triggers: [],
    labels: { urge: "Urge / intensity right now", expected: "Expected discomfort", actual: "Actual discomfort", duration: "uncomfortable part" },
    startFields: [], endFields: [], resources: []
  }
};
const MODULE_KEYS = Object.keys(MODULES);

// v1 problem ids -> modules (used by migration and defaults)
const V1_MODULE_MAP = { smoking: "smoking", procrastination: "procrastination", gym: "exercise", relationship: "relationship", job: "career", business: "productivity", money: "spending", habits: "routines" };

const DEFAULT_BEHAVIOURS = [
  { id: "smoking", module: "smoking", name: "Quit smoking", emoji: "🚬" },
  { id: "procrastination", module: "procrastination", name: "Procrastination", emoji: "⏳" },
  { id: "gym", module: "exercise", name: "Gym", emoji: "🏋️" },
  { id: "relationship", module: "relationship", name: "Relationship", emoji: "💬" },
  { id: "job", module: "career", name: "Job / Ausbildung search", emoji: "📄" },
  { id: "business", module: "productivity", name: "Side business", emoji: "🛍️" },
  { id: "money", module: "spending", name: "Saving money", emoji: "💶" },
  { id: "habits", module: "routines", name: "Daily habits", emoji: "🌱" }
];
