# Project name
> Work loop: collect ideas (me + AI) → AI plans → develop/test (AI) → I review → new ideas return to the pool.
> Split: I own ideas, review and trade-offs; AI owns design, development and automated tests. Bugs go straight to AI (fix within one iteration or accept); versioning is handled by the app's auto backup — neither enters the map.
> Boundaries first: before an idea moves to "In progress", pin its context in the "Domain map"; parallel work across contexts only after contracts are frozen.

## Goals

### One-line positioning

### Milestones this phase

### Non-goals
> Things we explicitly won't do, to prevent scope creep

## Domain map ::map
> Bounded context = change boundary = parallel boundary. One child node per context.

### Context name
> One-sentence responsibility / ubiquitous language keywords / outward contracts (depends on whom, depended on by whom)

## Idea pool
> Collected anytime by me and the AI; ideas under exploration/discussion carry the ::flask icon (conclusions in the note); once mature, remove the icon, categorize under "Domain map", and move into the matching context in "In progress".
> Branches are self-contained: write background and intent clearly — copy this branch to the AI and it is a complete context.

### Idea name
> Background / Intent

## In progress
> Ideas hang under their context; different contexts may each open a worktree in parallel (contexts in parallel carry the ::git-branch icon); no parallel work before contracts are frozen.

### Uncategorized
> Ideas with unclear ownership go here — categorizing is itself a boundary decision.

### Context name

#### Idea name
> Trade-off record (half-done / deferred, and why)

## Awaiting my review

### Idea name

## Done

### Idea name

## Won't do
> Accepting the status quo or letting go is also a decision.

### Idea name

## Conventions & decisions
> Conventions established early reduce rework; refine as the process evolves. Adjusting boundaries/contracts is also a decision — record it here.

### Decision name
> Conclusion + rationale
