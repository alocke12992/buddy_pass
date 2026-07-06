# Initial Plan

I want to make a workout application called "Buddy Pass". the idea is that it's a way to have "multiplayer" workouts, track progress with friends, workout at the same time as friends, and create and share workouts with friends then compare progress / stats with eachother. 

The app will have a few main features:
- Create and share workouts with friends
- Track progress with friends
- Workout at the same time as friends
- Compare progress / stats with eachother
- Keep track of sets, reps, weight, and duration 
- Keep track of workout history and progress over time


All timestamps should be in unix format (milliseconds) or datestring (or what ever is easier with postgres) - but we should store the datetimes as utc to avoid any timezone issues

### Multiplayer/Sync Mode
- Starts as a "normal" workout, but if sharing, will open an invitation, on acceptance, the a new workout is created 

## Open Questions
1. How do we get a list of equipment? 
2. How do we get a list of exercises?
4. How do we want to handle/support auto generated workouts? (e.g. AI generated workouts) - General concept:
  1. exercise goal (e.g. lose weight, build muscle, etc) - determines the weight and reps for each exercise (should also generate exercise weight based on a user's prior performance)
  2. cadence (push/pull, full body, upper/lower, muscle target, etc)
  3. muscle recovery? (I want to figure out a way to look at prior muscle groups worked and ensure adequate recovery time - have a way to track this somehow for a user so we can use that to determine which exercises to suggest next)
  4. variablity - do we want to just do the same things or mix it up?
  5. Experience - (would be based on user's settings, each exercise would have a difficulty level)
  6. Duration - How long should the workout be? (would be based on estimating how long each exercise will take combined with rest time)
- When creating a workout, sets and weights are generated based on the user who created - if workout is shared, once the user accepts the invite, exercises stay the same, but the sets and weights are generated based on that user's profile.
- Initial workout generation should be based on the user's profile (e.g. Male/Female, age, weight, height, experience level, etc)


- Friends 
  - Can send friend invites
  - Can choose how much info to share with friends (e.g. workout history, progress, etc)
  - Can see friends workouts (if shared)

  - Later:
    - Can comment on friends workouts
    - Can like friends workouts
    - Can share friends workouts

Some things to add later: 
- "How was it" feature on exercises - ability to set how many more reps you could do on a set. Used to calibrate the AI for future workouts (if was at 0 more reps, maintain or decrease weight, if was at 1+ more reps, increase weight etc.) should be "How many more reps could you do on the last set", options would be 0 (max effort), 1, 2, 3, 4+, 5+
- Your gym - customize what equipment your gym has

## Stretch features
- Challenges 
  - Compete with friends - should "normalize" though so if one person is stronger than another they can still compete and "win" regardless of strength
  - Ability to set challenge type - (consistency - num times in a week, total volume, total weight lifted, "most progress" - could be a % change in weight or reps or a combination of both (this would be the "normalized" competition), etc)
- Multiplayer or "Sync" mode
  - ability to see other people's workouts in real time e.g. If I add a set, the other user would be able to see the exercise/set/super set, ordering i just added
  - Need to figure out - how do default weights work? (if first set, maybe fall back to generation mode and determine reps and weight based on profile/algo, if 1+ set, would just copy the prev reps and weight)


## Architecture

Split Project - Frontend and Backend are separately deployed
Dockerized for easy deployment
Maybe use Turborepo to manage the monorepo


- Shared:
  - Typescript types and interfaces for backend and frontend

- Backend: Dockerized Node.js with PostgreSQL
  - Should have a seed file, be able to run locally, and be dockerized - so it runs locally the same way it would in production
- Frontend: React w/ typescript
  - Web First
  - Mobile (React Native)
  - State Management 
    - Just use React Context, top level Context folder, Context split based on data type (e.g. AuthenticationContext)
      - Each Sub-context should be in a subfolder (e.g. AuthenticationContext should be in a subfolder called Authentication)
      - The index file should export the context and the provider
      - Two files - one for the context and one for the provider
  - UI
    - Shadcn/ui
  - Routing
    - React Router
  - Query tool
    - React Query
  - Form handling
    - React Hook Form


#### INFRA
- CI/CD - GitHub Actions
- Infra as code - Terraform
- Authentication - Auth0
- Storage - AWS S3 (Assets)
- Compute - EC2
- Database - AWS RDS (PostgreSQL)
- AI Connection - AWS Bedrock

## Ingesting pre-defined data
Use this open source project to clone the exercises: https://github.com/yuhonas/free-exercise-db 
NOTE: Might need to modify our schema to match theirs ( e.g. primaryMuscles and secondaryMuscles - should update our schema + add this to how we generate workouts / track recovery time)

## Tables

### Workouts
- id
- date
- user_id
- creator_id
- created_at
- updated_at
- started_at
- ended_at
- exercises (List of foriegn keys to exercises table)
- analytics (Foriegn  key to analytics table)
- status (completed, in_progress, planned, cancelled etc)
- notes

<!-- Might want to break this into a separate table -->
- origin_workout_id (if cloned, this is the id of the original workout)
- cloned_ids (list of workout ids that were cloned from this workout)

<!--
 Created when workout is shared and sync is enabled - can keep track of eachother's progress in real time
-->
### Multiplayer_workouts
- id
- workout_ids (List of foriegn keys to workouts table)
- user_ids (List of foriegn keys to users table)
- status - pending (invite sent, hasn't been accepted), active, completed, cancelled
- created_at
- updated_at

### Workout_Analytics

<!-- Will be a table to store workout stats/analytics without bloating the workouts table -->
- id
- workout_id
- calories_burned
- duration
- heart_rate
- notes
- created_at
- updated_at

<!-- A pre-baked list of equipment that can be used in exercises -->
### Equipments
- id
- name
- photo
- type (cardio, weight, bodyweight, etc)
- description
- created_at
- updated_at
 
### Muscle Groups
- id
- name
- description
- created_at
- updated_at

<!-- A pre-baked / stored list of exercises that can be used in workouts -->
### Exercises
- id
- name
- description
- muscle_group
- category
- instructions
- difficulty
- equipment_ids (List of foriegn keys to equipments table)
- muscle_group_ids (List of foriegn keys to muscle_groups table)
- photo
- video

<!-- A join table to connect exercises to workouts -->
### Workout_Exercises
- id
- workout_id
- exercise_id
- order (The order of when the exercise is done in the workout)
- sets (List of foriegn keys to sets table)
- super_set_id (if part of a super set)
- created_at
- updated_at


### workout_sets
- id
- workout_exercise_id
- workout_id
- is_warmup
- order
- reps
- weight
- rest_time (last set in exercise don't auto play rest - can do in UI)
- completed
- created_at
- updated_at

### Users
- id
- name
- email
- password
- created_at
- updated_at

### User_Settings
- id
- user_id
- experience_level
- goal
- cadence
- variability
- duration
- created_at
- updated_at

### user_stats
- id
- user_id
- weight
- height
- gender
- age
- weight_history (array of weight entries with dates)
- created_at
- updated_at
<!-- Later - can add body measurements -->

<!-- A list of muscles and the last time they were worked -->
### User Recovery
- id
- user_id
- muscle_group_id
- last_worked
- created_at
- updated_at


<!-- Settings to customize what equipment is available at a gym -->
### User Gym
- id
- user_id
- equipment_ids (List of foriegn keys to equipments table)
- created_at
- updated_at


### user_friends
- id
- user_id
- friend_id
- created_at
- updated_at
- status (pending, accepted, rejected)

<!-- Need a way to share a workout invite and persist it -->
### workout_invites
- id
- workout_id
- user_id
- friend_id
- created_at
- updated_at
- status (pending, accepted, rejected)


