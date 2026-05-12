# Security Spec

## Data Invariants
1. A workout activity cannot exist without a valid user ID that belongs to the user.
2. A user profile cannot be accessed by other users unless public.
3. Only authenticated users can create activities.
4. An activity cannot be modified after it's finished unless by the owner.

## The "Dirty Dozen" Payloads
1. Unauthorized user attempting to read any data.
2. User attempting to create activity with different `userId`.
3. User attempting to delete another user's activity.
4. User updating `distance` on someone else's activity.
5. User updating `distance` with an invalid type (string instead of number).
6. User updating `status` on their own activity skipping states.
7. Shadow Update: Adding `isAdmin: true` field.
8. Email spoofing: Using unverified email to access features.
9. Array size exhaustion: Adding +1000 items to `likes`.
10. ID Poisoning: Creating activity with document ID `../../../`
11. Missing required field `userId` when creating an activity.
12. Attempt to update immutable field `createdAt`.

## Test Runner Goal
Tests will ensure that unverified payloads are strictly rejected by the rules.
