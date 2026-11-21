# Story mode: the framework and Sunday

Status: approved by the owner on 2026-11-21. It builds on `2026-11-18-story-mode-design.md`, which holds the owner's characters, traits, items and days; this document does not repeat them. Roadmap step 41 (41a framework, 41b Sunday), then one step per later day.

## Intent and why

The owner wants the group's real week in Marrakech (Sunday to Saturday) retold as a co-op game that the six friends play together, each as himself, using the main game's driving and items plus minigames for the trip's moments. Success is the friends recognising their week and laughing at their own traits, over several evenings.

## Goals

1. A story mode chosen from the lobby, separate from the race (the five stages and Full route stay as they are).
2. An open, walkable villa as the hub of each day, with a list of the day's goals done in any order.
3. Days on a clock (about 10 real minutes from morning to night); at night everyone must be back at the villa to sleep.
4. Five needs per friend that carry over the whole week: health, food, money, happiness, tiredness.
5. Each friend's trait working as described in the earlier notes.
6. The week saved under the room's name and continued on a later evening.
7. Sunday fully playable as the first day.

## Non-goals (this step)

- Monday to Saturday (one step each, later; each minigame gets its own short design conversation).
- New vehicles (the buggy comes with Monday).
- The rich quarter with traffic (Tuesday), the ending scene (Saturday).

## Anti-goals

- Days that drag: a day that cannot fit in its clock is badly designed, not a reason to stretch the clock silently.
- A friend's absence breaking the story.
- The race mode getting slower or changing.

## Owner decisions (this conversation)

1. **Open villa (A).** The villa is a 3D place you walk around. Each day has a list of goals (for example "eat the tajine", "go to PrimeGolf") done in any order. Driving stages and minigames start from the villa: you get in the Lodgy, a stage loads, and you come back to the villa afterwards.
2. **On the clock.** A day runs on an in-game clock of about 10 real minutes from morning to night. At night everyone must be back at the villa to sleep. Goals not done are missed: they cost happiness and that moment is gone from the story.
3. **Needs carry over the whole week**, with a money safety net: when money runs dangerously low, a secret stock-picking minigame on the phone ("Fake Republic" in game) can win an emergency top-up.
4. **Absent friends.** A friend nobody is playing is "chilling at the villa": while the group is at the villa, his figure sits on the living-room couch; while the group is out, he is "at the WC" (no figure). Goals that need him are skipped that night.
5. **Saving.** The week is stored on the server under the room's name; opening that room again continues the week.
6. **Story director (approach 2).** See Approaches.
7. **A performance step**, used only if the story worlds turn out heavy on phones.

## Approaches

1. **Everything in one world** (the villa, the roads and every minigame in one big physics world, the clock and needs inside it). Simple on paper, but that world gets huge, every minigame sits beside the driving physics, and phones would load slowly. Rejected.
2. **A story director in the room that switches between small worlds** (chosen by the owner). The director holds the week (clock, needs, money, goals, save). The worlds load only when needed: the villa, a driving stage, or a minigame. Getting in the Lodgy switches to a stage world through the step 40 stage switch (which already carries health, money and seats), and coming back switches to the villa. Minigames are their own small worlds, built and tested one at a time.
3. **Story run on each player's device.** Rejected: co-op needs the server to decide what happens, as it does today.

## The design

### Story director (server, room layer)

- A room is either in race mode (today) or story mode, chosen in the lobby by the admin. Story mode uses the same room and players.
- The director's state, the **week**, contains:
  - the current day;
  - the day clock;
  - per friend (by character, not by player): the five needs, money, the trait meters, and the items carried between worlds;
  - the goals of the current day and whether each is done, missed or skipped;
  - the finished days.
- It switches the room's world (villa, stage, minigame) with a message like step 40's `stage`. The whole group is always in the same world; there is no split party (builder's call, following "get in the Lodgy" as a group outing).
- Step 40's carry moves health, money, ammo and seats. The story extends it with food, happiness, tiredness and the trait meters. Inside a stage or minigame world the existing health, fuel and items apply, and afterwards the values are written back to the week.
- **The villa world** is a small course with no corridor terrain, built from boxes and models, with the Lodgy parked at the gate. It runs on the same `createWorld` as the race, not a new kind of world. Minigame worlds are the same: small courses of their own (builder's call).
- **The clock:**
  - It runs at the villa and while driving.
  - It pauses inside a minigame, which has its own length (builder's call, so a minigame is never cut short).
  - Night while driving: the drive's end brings the group back, and the day ends after the sleep.
  - A goal not finished by night is missed.
  - The owner allows a day to run past 10 minutes when it needs to.
- **Losing a day:**
  - A downed friend who is not revived in time loses the day.
  - The day restarts from its morning, with the week as it was at that morning. Finished days stay done.
  - Health can be lost by driving, hunger and an angry ally, so every day can be lost.

### The needs (0–100 each unless noted)

- **Health:** as today; downed at 0, revived by an ally.
- **Food:** falls with time and effort. Hunger below a threshold costs health slowly.
- **Money:** cash in dirhams, a number rather than a bar. It is spent in shops and on the phone. ATMs move money from the friend's bank account into cash. Each friend starts the week with 2,000 dirhams in the bank (owner), and the account is never refilled except by the secret stock picking.
- **Happiness:** raised by meals, goals done, vibecoding and fun; lowered by missed goals, complaints and hunger.
- **Tiredness:** rises during the day, with exertion, and with vibecoding. Sleep resets most of it. When high, the friend is slower.

The exact rates are the builder's starting values (tuning is the owner's call), chosen so that a day played normally ends with nobody downed by hunger.

### Traits (from the earlier notes)

- **Raph:** eats more. A hidden anger bar fills while he is hungry; when full, his attacks can hit allies until he eats.
- **Ishan:** eats only pizza, which comes from asking the villa's chef.
- **Sacha:** must spend: his happiness falls unless he buys TCG cards or clothes on his phone.
- **Huu:** must say "le mal est fait" often (a quick phrase); his happiness falls when he has not said it for a while.
- **Louis:** complains any time (a button for a complaint bubble). His caffeine meter: coffee speeds him up, then slows him down when it wears off.
- **Sunil:** vibecodes the most. A hidden bar costs him health when he goes too long without vibecoding.
- **Vibecoding:** for everyone, sitting at a laptop at the villa raises happiness and tiredness.

### The villa (walkable hub)

- Built in the game's style from the earlier description, not from the photos:
  - a single-storey house with a flat roof, around a rectangular pool;
  - the terrace with loungers and parasols, a lawn with palms and olive trees;
  - a pickleball court, and the gym pavilion with the cold plunge;
  - inside: the open-plan living room with the grey couch, the black kitchen island and the long dining table.
- **Interactive spots:**
  - the kitchen (food, and the chef for pizza);
  - the couch (absent friends sit there);
  - laptops (vibecoding);
  - beds (sleep);
  - the Lodgy parked at the gate (outings);
  - the day board (the goal list).
- An ATM and a small grocery shop are a short walk away, or at the gate. The big Atacadão is an outing.
- The villa is a small world with no corridor terrain. It must load fast on phones.

### Shops, ATMs and the phone

- Shops sell the items listed in the earlier notes, at prices in dirhams. An ATM tops up cash from the friend's account.
- The phone (a menu key or button) holds:
  - the money;
  - Sacha's shopping;
  - the secret stock-picking minigame.
- **The secret stock-picking minigame:**
  - It shows up only when the friend's money is below a low threshold.
  - Pick one of three stocks, then watch a short price chart.
  - You can win or lose, never below zero, and it can be played once per day.
  - Its in-game name is "Fake Republic" (owner).

### Who plays whom

- Each player picks his friend in the lobby with the existing character picker. A friend can be taken by only one player (`character_taken` already exists). The week is keyed by friend, not by player, so a different person can play Raph on a later evening.
- **Joining mid-day:** the friend stops being absent and joins with his saved needs. **Leaving mid-day:** he becomes absent, and his needs are frozen.

### Absent friends

- On loading a day, the friends with no player are absent.
- At the villa their figures sit on the couch. Outside, they are "at the WC" with no figure, and a toast says so once.
- Their needs are frozen while absent.
- Goals tagged with an absent friend are skipped. They neither cost happiness nor count as missed.

### Saving

- The week is stored under the room's name:
  - on Cloudflare in the Durable Object's storage;
  - on the Node server in memory or a local file.
- It is saved at the end of each day and when the room empties.
- Opening the room continues the week at the morning of the current day; progress inside an unfinished day is not kept.
- Retrying a lost day is unlimited.
- Cloudflare storage is the required target; the Node server keeps the week in memory.
- The saved week carries a format version (builder's calls).
- The admin can reset the week from the lobby.

### Sunday (the first playable day)

The day's goals are listed below in the owner's order. The arrival drive is first, then the villa and PrimeGolf in any order. The tajine needs every present friend at the table. These are builder's calls.

1. **Arrive on foot (owner: A).** A new short on-foot course runs from the arrival hall to the rental car stop, through obstacles and knife enemies, with the guns.
2. **Pick up the Lodgy and drive to the villa.** The drive is the airport road reversed (airport → villa, the opposite way to the race stages) and ends at the villa gate.

3. Discover the villa and eat the tajine together.
4. PrimeGolf: an outing by Lodgy to a Topgolf-like range. Players hit balls at targets in turns. PrimeGolf needs its own short design conversation (how a turn works, the targets, the scoring) before Sunday is planned.
5. Drive back and sleep.

## Left to the builder (the plan)

- The exact message and state shapes.
- The need rates and thresholds.
- The phone menu's look within the step 35 theme.
- The villa's exact layout and the models (Sketchfab, most downloaded usable, CC0/CC BY, credited, as always).
- How the clock is shown.
- How goals are shown on the day board and the HUD.
- The test list.
- The order of tasks.

## Performance

A separate roadmap step, used only if needed: measure each story world's load time and frame rate on a phone, and refactor where they miss the budgets the main game already uses.
