// Demo community: seeded profiles that like new users and reply to messages,
// so a fresh deployment feels alive. Disable with DEMO_MODE=false.
import crypto from 'node:crypto'
import { one, all, run } from './db.js'

export const DEMO_ENABLED = process.env.DEMO_MODE !== 'false'

const face = (id) => `https://images.unsplash.com/photo-${id}?w=900&h=1125&fit=crop&crop=faces&auto=format&q=80`
const scene = (id) => `https://images.unsplash.com/photo-${id}?w=900&h=1125&fit=crop&auto=format&q=80`

const SCENES = {
  hills: scene('1501854140801-50d01698950b'),
  coffee: scene('1495474472287-4d71bcdd2085'),
  restaurant: scene('1517248135467-4c7edcad34c4'),
  beach: scene('1507525428034-b723cf961d3e'),
  hike: scene('1551632811-561732d1e306'),
  dog: scene('1587300003388-59208cc962cb'),
  mic: scene('1511671782779-c97d3d27a1d4'),
  food: scene('1504674900247-0877df9cc836'),
  valley: scene('1469474968028-56623f02e42e'),
  fuji: scene('1528164344705-47542687000d'),
  paint: scene('1513364776144-60967b0f800f'),
  track: scene('1461896836934-ffe607ba8211'),
  concert: scene('1514525253161-7a46d19cd819'),
  cat: scene('1543852786-1cf6624b9987'),
  peaks: scene('1506905925346-21bda4d32df4'),
  festival: scene('1493225457124-a3eb161ffa5f'),
  code: scene('1517694712202-14dd9538aa97'),
  gym: scene('1534438327276-14e5300c3a48'),
}

const P = (question, answer) => ({ question, answer })

// [name, gender, interestedIn, birthYear, department, jobTitle, hometown, heightCm, faceId, scenes, interests, prompts, likesBack]
const PEOPLE = [
  ['Aanya', 'woman', 'men', 1997, 'Design', 'Product Designer', 'Pune', 165, '1494790108377-be9c29b29330', ['coffee', 'paint'], ['Design', 'Coffee', 'Art', 'Travel'],
    [P('My most irrational fear', 'Replying-all by accident. It has happened. Twice.'), P('The way to win me over is', 'Good typography and a better playlist.')], true],
  ['Maya', 'woman', 'everyone', 1995, 'Engineering', 'Backend Engineer', 'Bengaluru', 168, '1438761681033-6461ffad8d80', ['hike', 'code'], ['Hiking', 'Tech', 'Board games', 'Coffee'],
    [P('I geek out on', 'Distributed systems and trail maps, in that order.'), P('A perfect Friday after work', 'Sunset hike, momos, early night. Yes I am that person.')], true],
  ['Sofia', 'woman', 'men', 1996, 'Marketing', 'Brand Strategist', 'Mumbai', 162, '1534528741775-53994a69daeb', ['festival', 'restaurant'], ['Music', 'Food', 'Travel', 'Fashion'],
    [P('Two truths and a lie', 'I have met Prateek Kuhad. I can juggle. I have never missed a deadline.'), P('Best lunch spot near the office', 'The tiny dosa place nobody else knows about. I will take you.')], false],
  ['Ishita', 'woman', 'men', 1998, 'People', 'Talent Partner', 'Delhi', 160, '1524504388940-b1c1722653e1', ['beach', 'dog'], ['Dogs', 'Beaches', 'Yoga', 'Reading'],
    [P('My simple pleasures', 'Window seat, chai, and a book I cannot put down.'), P('Green flags I look for', 'You are kind to waiters and you text back.')], true],
  ['Zara', 'woman', 'men', 1994, 'Finance', 'Financial Analyst', 'Hyderabad', 170, '1529626455594-4ff0802cfb7e', ['fuji', 'food'], ['Travel', 'Food', 'Running', 'Photography'],
    [P("I'm weirdly attracted to", 'People who have strong opinions about spreadsheets.'), P('Next trip on my list', 'Japan in cherry blossom season. Taking applications for a travel buddy.')], true],
  ['Leah', 'woman', 'everyone', 1996, 'Data', 'Data Scientist', 'Chennai', 163, '1544005313-94ddf0286df2', ['code', 'cat'], ['Tech', 'Cats', 'Podcasts', 'Baking'],
    [P('My most controversial office opinion', 'Meetings should have a snack budget.'), P('We will get along if', 'You can explain your favourite chart to me with passion.')], true],
  ['Amara', 'woman', 'men', 1995, 'Sales', 'Account Executive', 'Kochi', 172, '1531123897727-8f129e1688ce', ['track', 'concert'], ['Running', 'Music', 'Dancing', 'Fitness'],
    [P('Unusual skill', 'I can close a deal and a pickle jar with equal confidence.'), P('A perfect Friday after work', 'Live music, then tacos at midnight.')], false],
  ['Riya', 'woman', 'men', 1999, 'Product', 'Associate PM', 'Jaipur', 158, '1488426862026-3ee34a7d66df', ['hills', 'coffee'], ['Coffee', 'Startups', 'Hiking', 'Writing'],
    [P('I geek out on', 'User interviews. Tell me your problems, literally.'), P('The way to win me over is', 'A handwritten note. Bonus points for doodles.')], true],
  ['Chloe', 'woman', 'men', 1997, 'Design', 'Illustrator', 'Goa', 166, '1517841905240-472988babdf9', ['paint', 'beach'], ['Art', 'Beaches', 'Movies', 'Vinyl'],
    [P('Two truths and a lie', 'I have painted a mural. I hate the sea. I own 200 records.'), P('My simple pleasures', 'Sketching strangers on the metro. Do not worry, I make them look good.')], true],
  ['Nina', 'woman', 'women', 1996, 'Legal', 'Legal Counsel', 'Kolkata', 167, '1508214751196-bcfd4ca60f91', ['valley', 'restaurant'], ['Reading', 'Wine', 'Hiking', 'Theatre'],
    [P('Green flags I look for', 'You read the terms and conditions. Or at least pretend to.'), P('Best lunch spot near the office', 'Anywhere with a terrace.')], true],
  ['Tara', 'woman', 'men', 1993, 'Operations', 'Ops Lead', 'Chandigarh', 164, '1489424731084-a5d8b219a5bb', ['dog', 'hike'], ['Dogs', 'Hiking', 'Cooking', 'Football'],
    [P('My most irrational fear', 'Running out of things to say on a date. Prove me wrong.'), P('We will get along if', 'You will let my dog be the third wheel.')], true],
  ['Mei', 'woman', 'everyone', 1998, 'Engineering', 'Frontend Engineer', 'Shillong', 161, '1502823403499-6ccfcf4fb453', ['concert', 'code'], ['Music', 'Tech', 'Anime', 'Gaming'],
    [P('Unusual skill', 'I can center a div on the first try.'), P('A perfect Friday after work', 'Ramen, arcade, and arguing about which anime is best.')], false],
  ['Arjun', 'man', 'women', 1995, 'Engineering', 'Staff Engineer', 'Bengaluru', 180, '1507003211169-0a1dd7228f2d', ['peaks', 'code'], ['Tech', 'Hiking', 'Coffee', 'Photography'],
    [P('I geek out on', 'Mechanical keyboards. I can hear your switches judging you.'), P('The way to win me over is', 'Recommend me a book I end up loving.')], true],
  ['Kabir', 'man', 'women', 1994, 'Product', 'Product Manager', 'Mumbai', 178, '1500648767791-00dcc994a43e', ['restaurant', 'fuji'], ['Food', 'Travel', 'Startups', 'Cricket'],
    [P('Best lunch spot near the office', 'I have a ranked list. It is shared on Notion. Ask me.'), P('Two truths and a lie', 'I have been to 21 countries. I hate pizza. I once met Dhoni.')], true],
  ['Rohan', 'man', 'women', 1996, 'Design', 'UX Researcher', 'Pune', 175, '1506794778202-cad84cf45f1d', ['coffee', 'paint'], ['Design', 'Coffee', 'Art', 'Cycling'],
    [P('My simple pleasures', 'Freshly sharpened pencils and a quiet cafe.'), P('Green flags I look for', 'You ask follow-up questions.')], false],
  ['Leo', 'man', 'everyone', 1998, 'Marketing', 'Content Lead', 'Goa', 177, '1539571696357-5a69c17a67c6', ['beach', 'festival'], ['Music', 'Beaches', 'Writing', 'Surfing'],
    [P('A perfect Friday after work', 'Beach, guitar, bad singing. You can join the choir.'), P('My most controversial office opinion', 'Hot desking is a crime against humanity.')], true],
  ['Vikram', 'man', 'women', 1993, 'Sales', 'Sales Director', 'Delhi', 183, '1552058544-f2b08422138a', ['gym', 'restaurant'], ['Fitness', 'Food', 'Football', 'Whisky'],
    [P("I'm weirdly attracted to", 'People who laugh at their own jokes before the punchline.'), P('We will get along if', 'You like long brunches and short meetings.')], true],
  ['Ethan', 'man', 'women', 1997, 'Data', 'ML Engineer', 'Hyderabad', 179, '1492562080023-ab3db95bfbce', ['hike', 'valley'], ['Hiking', 'Tech', 'Camping', 'Podcasts'],
    [P('Unusual skill', 'I can start a campfire without matches. And a model without a GPU.'), P('Next trip on my list', 'Spiti valley on a bike.')], true],
  ['Dev', 'man', 'women', 1995, 'Finance', 'Investment Analyst', 'Ahmedabad', 176, '1519085360753-af0119f7cbe7', ['coffee', 'track'], ['Running', 'Coffee', 'Chess', 'Reading'],
    [P('I geek out on', 'Chess openings. I will teach you the Sicilian on our first date.'), P('My simple pleasures', 'Sunday long runs and a big breakfast after.')], false],
  ['Sam', 'man', 'everyone', 1996, 'People', 'L&D Specialist', 'Chennai', 174, '1521119989659-a83eee488004', ['mic', 'concert'], ['Music', 'Theatre', 'Comedy', 'Cooking'],
    [P('Two truths and a lie', 'I do stand-up. I have stage fright. I can cook a mean biryani.'), P('The way to win me over is', 'Laugh at my bad puns. Even the really bad ones.')], true],
  ['Aditya', 'man', 'women', 1994, 'Operations', 'Program Manager', 'Lucknow', 181, '1527980965255-d3b416303d12', ['dog', 'hills'], ['Dogs', 'Travel', 'Cooking', 'Movies'],
    [P('My most irrational fear', 'Geese. Do not ask.'), P('Green flags I look for', 'You have a favourite chai spot and you will defend it.')], true],
  ['Noah', 'man', 'men', 1997, 'Legal', 'Paralegal', 'Shimla', 178, '1570295999919-56ceb5ecca61', ['peaks', 'cat'], ['Cats', 'Skiing', 'Reading', 'Wine'],
    [P('A perfect Friday after work', 'Wine, a crime documentary, and a cat on my lap.'), P('We will get along if', 'You do not mind a little sarcasm.')], true],
  ['Omar', 'man', 'women', 1995, 'Engineering', 'Mobile Engineer', 'Kochi', 177, '1566492031773-4f4e44671857', ['food', 'gym'], ['Fitness', 'Food', 'Tech', 'Basketball'],
    [P("I'm weirdly attracted to", 'Good handwriting. It is rare now.'), P('Best lunch spot near the office', 'The biryani place with the 40 minute queue. Worth it.')], true],
  ['Ravi', 'man', 'women', 1993, 'Marketing', 'Growth Marketer', 'Indore', 172, '1474176857210-7287d38d27c6', ['festival', 'food'], ['Music', 'Food', 'Travel', 'Football'],
    [P('Unusual skill', 'I can guess any Bollywood song in three notes.'), P('My simple pleasures', 'Street food crawls and long walks after.')], false],
]

const PROMPT_COMMENTS = [
  'Okay this made me laugh out loud in the middle of a standup',
  'Strong opinion, I respect it. Coffee to debate?',
  'I need to hear the full story behind this',
  'Finally someone who gets it',
]
const PHOTO_COMMENTS = [
  'Love this photo! Where was it taken?',
  'Okay, this is a great photo',
  'You had me at this one 😄',
]

const DEMO_REPLIES = [
  'Haha I was hoping you would say something! How is your week going?',
  'Okay you seem fun. What do you do when you are not at work?',
  'That is honestly the best thing I have read today',
  'We should grab coffee near the office sometime. Thursday?',
  'Ha, noted! Tell me something nobody at work knows about you',
  'I like where this is going 😄',
  'Sorry, back-to-back meetings! But yes, absolutely',
]

export const seedDemo = async () => {
  if (!DEMO_ENABLED) return
  if (await one('SELECT 1 FROM users WHERE is_demo = 1')) return

  for (const [i, p] of PEOPLE.entries()) {
    const [name, gender, interestedIn, year, department, jobTitle, hometown, height, faceId, scenes, interests, prompts] = p
    const month = String((i % 12) + 1).padStart(2, '0')
    await run(
      `INSERT INTO users (email, password_hash, name, birthdate, gender, interested_in, department, job_title,
        hometown, height_cm, photos, prompts, interests, onboarded, is_demo, last_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now', ?))`,
      `demo${i + 1}@bafive.app`,
      crypto.randomBytes(24).toString('hex'), // unusable password: demo accounts cannot sign in
      name, `${year}-${month}-15`, gender, interestedIn, department, jobTitle, hometown, height,
      JSON.stringify([face(faceId), ...scenes.map((s) => SCENES[s])]),
      JSON.stringify(prompts), JSON.stringify(interests),
      `-${(i * 37) % 600} minutes`,
    )
  }
  console.log(`🌱 Seeded ${PEOPLE.length} demo profiles`)
}

const likesBackByName = new Map(PEOPLE.map((p) => [p[0], p[12]]))
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const wantsGender = (pref, gender) =>
  pref === 'everyone' || (pref === 'men' && gender === 'man') || (pref === 'women' && gender === 'woman')

// When someone finishes onboarding, a few compatible demo profiles like them.
export const onNewUser = async (user) => {
  if (!DEMO_ENABLED || user.is_demo) return
  const candidates = (await all('SELECT * FROM users WHERE is_demo = 1')).filter(
    (d) => wantsGender(d.interested_in, user.gender) && wantsGender(user.interested_in, d.gender),
  )
  const chosen = candidates.sort(() => Math.random() - 0.5).slice(0, 3)
  const prompts = JSON.parse(user.prompts)
  for (const [i, d] of chosen.entries()) {
    const onPrompt = i === 1 && prompts.length > 0
    await run(
      `INSERT OR IGNORE INTO likes (from_id, to_id, target_type, target_index, comment, is_rose, created_at)
       VALUES (?, ?, ?, 0, ?, ?, datetime('now', ?))`,
      d.id, user.id, onPrompt ? 'prompt' : 'photo',
      i === 2 ? null : pick(onPrompt ? PROMPT_COMMENTS : PHOTO_COMMENTS), i === 0 ? 1 : 0, `-${i * 7} minutes`,
    )
  }
}

// Called right after a real user likes a demo profile.
export const demoLikesBack = async (demo, user, { comment, rose }) => {
  if (!DEMO_ENABLED) return
  const keen = likesBackByName.get(demo.name) ?? true
  if (!keen && !comment && !rose) return
  if (!wantsGender(demo.interested_in, user.gender)) return
  await run(
    "INSERT OR IGNORE INTO likes (from_id, to_id, target_type, comment) VALUES (?, ?, 'profile', NULL)",
    demo.id, user.id,
  )
}

export const demoReply = (matchId, demoId) => {
  if (!DEMO_ENABLED) return
  const delay = 2500 + Math.random() * 3000
  setTimeout(async () => {
    try {
      if (!await one('SELECT 1 FROM matches WHERE id = ?', matchId)) return
      const { n } = await one('SELECT COUNT(*) AS n FROM messages WHERE match_id = ? AND sender_id = ?', matchId, demoId)
      await run('INSERT INTO messages (match_id, sender_id, body) VALUES (?, ?, ?)', matchId, demoId, DEMO_REPLIES[n % DEMO_REPLIES.length])
    } catch (err) {
      console.error('demo reply failed', err)
    }
  }, delay).unref()
}
