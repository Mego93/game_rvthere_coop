# Story mode: Monday

Status: owner's answers from the 2026-11-22 conversation; builder check done. It builds on `2026-11-21-story-mode-framework-design.md` (the framework and Sunday) and `2026-11-18-story-mode-design.md` (the characters, traits and days). Roadmap: 41c (buggy and lunch), then 41d (tailor and souk).

## Intent

Monday retells the group's second day: a buggy run in the Agafay stony desert, lunch at a desert camp, then Marrakech, with the tailor (Ishan and Sacha's expensive outfits) and a wander through the souk, where sellers pester the group with fake deals.

## Day flow

The order is villa, buggy race, lunch at the camp, tailor, souk, back to the car, villa, sleep. Like Sunday, the outings start from the villa gate. The clock runs everywhere except in minigames.

## 41c: the buggy and lunch

### Owner decisions

1. **The buggy** is one shared off-road buggy with six seats: one driver and five passengers, like the Lodgy.
2. **The race** is a desert course of about 3 minutes, raced against the clock.

### My calls (accepted in conversation)

**Buggy handling.** It is faster and grippier off-road than the Lodgy.
- A top speed of about 120 km/h.
- 0 to 100 in about 6 s.
- Strong suspension for jumps.
- It takes dirt and sand surfaces with almost no grip loss.
- It is a new entry in the vehicle configs, used only on Monday.

**The Agafay course** is hand-built from road segments like the step 40 valley.
- **Length:** about 3 minutes at buggy pace, so about 3.5 to 4 km.
- **Ground:** stony dirt and sand.
- **Features:** dunes, jumps (crests), rocks and a couple of tight turns.
- **Theme:** desert.
- **Scenery:** a few tents and camels by the road.

**The race clock.**
- It starts at the start line and is shown on screen.
- The checkpoints are the course's own.
- At the finish the time is shown with a medal: gold under the target time, silver under 1.25 × target, bronze otherwise.
- **Happiness by medal, for every present friend:** gold +10, silver +5, bronze 0. A run more than twice the target costs −5.
- The race is a minigame for the clock: the day's clock pauses during it, like PrimeGolf.

**Lunch at the camp.**
- The race's finish leads to the camp, a small walkable world with a tent, low tables and cushions.
- Eating together there is free, like Sunday's tajine. Ishan gets pizza.
- After lunch the group drives on to Marrakech; the drive is cut, as PrimeGolf's is.

## 41d: the tailor and the souk

### Owner decisions

1. **The tailor.**
   - Ishan and Sacha each pick an outfit with an outfit picker: jacket, shirt, trousers and colours.
   - An outfit costs 1,500 dh or more, from their bank.
   - The outfit then shows on their character for the rest of the week.
   - The others wait in the shop with tea or coffee, or vibecode.
   - If both are absent, the tailor is skipped.
2. **The souk** is a loose free roam in Marrakech's main market.
   - The goal is to visit every part of the souk and come back to where the car is parked.
   - Sellers come up to the group with deals. You can refuse, accept, negotiate or fight.
   - **Offers by friend:** Huu gets sneaker offers. The others get bags, watches, clothes and perfume.
3. **Negotiating** is a quick haggle.
   - The seller names a price, and the player picks a counter-offer.
   - The seller accepts, counters, or is offended and walks away.
   - It lasts two or three rounds at most.
4. **Fighting.**
   - A seller who is attacked, or refused too rudely, pulls a knife and becomes a knife enemy (step 39).
   - His stall's crowd turns hostile for a short while.
5. **The souk map** is hand-built: a fixed maze of alleys around five areas.

### My calls

**The five areas:** the spice square, the leather alley, the lantern street, the shoe corner and the jewellery lane.
- An area counts as visited when any one friend has been inside it, so the group can split up (my call).
- The souk goal is done when all five are visited and everyone is back at the car.

**Brand names are parodies**, like Koke Zero and PrimeGolf: "New Balanz 9060", "Air Farce 1", and so on. No real brand appears in the game.

**Prices.**
- Items cost 100 to 1,500 dh.
- A seller's first price is about twice a fair price. A good haggle gets close to fair.
- Insulting the seller (a counter below 30 % of his price) offends him.
- A rude refusal is a second refusal of the same seller within a few seconds.

**What buying does.**
- A bought item gives happiness to the buyer: more for something the friend likes, and most for Huu's sneakers.
- It also counts as Sacha's spending.
- Some deals are fakes, revealed after buying ("the Rolex says Rolax"). A fake costs a little happiness but is good for a laugh.

**Sellers.**
- At most 3 sellers come up to the group at a time, and each approaches one friend.
- A seller who is refused leaves.

**Fighting a seller.** It uses the step 39 knife enemy rules. Downed friends are revived as usual.

**The outfit picker.**
- Three jacket styles, three shirt styles, two trousers and six colours.
- The price depends on the picks, from 1,500 to 3,000 dh.
- The outfit is saved in the week and shows for the rest of the week (see below).

## Settled after the builder check (my calls)

**The buggy.**
- It is a new vehicle id `buggy` with six seats, using the existing seat and driver rules, and it appears only in the race world.
- The camp and the souk are on foot.
- In the souk, the car the group returns to is the Lodgy, parked at the souk entrance.

**The race.**
- It is an outing world with checkpoints. Like PrimeGolf, it is a minigame for the clock.
- The server owns the race timer: it is the world's elapsed time, and the finish is the course finish.
- Absent friends are at the WC, as usual.

**Target time.**
- It is fixed per course: the scripted buggy's measured time × 1.3, rounded to 5 s.
- The plan must measure the course and keep the target between 150 and 210 s. An unfinished run is impossible: the clock is paused and the race only ends at the finish.

**Flips and getting stuck.** The existing restart-checkpoint and stuck-reset rules apply. There is no quitting.

**A hostile crowd.** When a seller turns hostile, 2 crowd members near his stall also become knife enemies for 30 s. Sellers and the crowd move like step 39 enemies. There is no vehicle in the souk.

**Fakes.** Each bought item has a 20 % chance to be a fake, which costs 5 happiness. The item list with prices and likes is fixed in the plan.

**Outfits.**
- The outfit is stored as a new `outfit` field in the friend's week state: jacket, shirt, trousers and colour.
- The week save goes to version 2, with a v1 → v2 upgrade that adds no outfit.
- The client draws the outfit in place of the friend's `top` look.

## Goals, non-goals and anti-goals

**Goals:**
- Monday is playable end to end after 41d.
- The buggy race is playable on its own after 41c, as Monday's first part.
- Days after 41c show "coming soon" for the parts not yet built.

**Non-goals:**
- traffic in the city;
- a souk map that changes every visit;
- real brands;
- outfits for the other four friends.

**Anti-goals:**
- A souk where sellers swarm so hard you cannot walk.
- A race nobody can finish in 3 minutes on a phone.

## Approaches

1. **Monday in one step.** About twice Sunday's size: a long wait before anything is playable, and one big review where problems hide. Rejected.
2. **Two steps (chosen by the owner):** 41c is the buggy and lunch, and 41d is the tailor and the souk. Each is playable and reviewable on its own.

For the souk map, a hand-built map was chosen over a generated one. The same layout every time is learnable and testable.

## Left to the builder (the plans)

- The buggy's exact config numbers, within the targets above.
- The Agafay segment list.
- The camp and souk layouts.
- The seller AI details.
- The haggle UI.
- The outfit picker UI and its models.
- The Sketchfab assets: the buggy, tents, camels, souk stalls, lanterns, sneakers, bags, watches and perfume bottles. As always, the most downloaded usable model, CC0 or CC BY, credited, with logos neutralised.
- The test lists.
