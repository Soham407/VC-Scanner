# VS Scanner

VS Scanner helps a team capture business cards, extract contact details, and store scan results for follow-up work.

## Language

**Team**:
The shared event boundary where business cards are captured and stored for follow-up.
_Avoid_: Booth, account, org, workspace

**Team Leader**:
The user who manages team membership and assigns work.
_Avoid_: Admin, owner, manager

**Worker**:
A team member who receives assigned scans and works only on those assignments.
_Avoid_: Member, operator, collaborator

**Membership**:
The link between a user and a team.
_Avoid_: Subscription, account link

**Assignment**:
The link between a scan and the worker responsible for it.
_Avoid_: Ownership, task, ticket

**Team Inbox**:
The set of unassigned scans for a team.
_Avoid_: Queue, backlog, intake

**Invite**:
An invitation sent to an email address to join a team.
_Avoid_: Signup, account creation

**Pending Invite**:
An invite that has been sent but not yet accepted.
_Avoid_: Notification, request

**Assignment State**:
The current review state of an assignment.
_Avoid_: Status, workflow

**Batch Assignment**:
The bulk distribution of captured scans to workers after capture.
_Avoid_: Auto-save, live routing

## Relationships

- A **Team** has one or more **Team Leaders**
- A **Team** has zero or more **Workers**
- A **User** can have multiple **Memberships**
- The creator of a **Team** becomes a **Team Leader**
- A **Team Leader** creates an **Assignment**
- A **Team Leader** sends an **Invite**
- A **Team** can have multiple **Team Leaders**
- An **Invite** can be sent to any email address
- An **Invite** can be accepted only by the invited email address
- A **Pending Invite** becomes a **Membership** when accepted
- The app forces an accept/decline dialog for each **Pending Invite**
- A **User** has exactly one active **Team** at a time
- A user can accept multiple team invites
- A newly scanned card goes to the active **Team**
- A **Team** has a **Team Inbox** for unassigned scans
- A **Team Leader** can see the full **Team Inbox**
- A **Worker** can see only their own capture history
- A **Batch Assignment** happens after capture, not during capture
- A **Batch Assignment** requires **Team Leader** approval
- A **Batch Assignment** is created manually by a **Team Leader**
- A **Batch Assignment** can be edited before final approval
- A **Batch Assignment** distributes scans by least-loaded worker, with round-robin fallback
- A **Worker** sees only their assigned scans and the details needed for follow-up
- After switching **Team**, the first scan should confirm the selected **Team**
- An **Assignment** belongs to exactly one **Worker**
- A **Team Leader** can still see assigned scans
- A **Worker** can see only the scans in their **Assignments**
- Only a **Team Leader** can reassign an **Assignment**
- An **Assignment** can be marked `done` or `needs review`

## Example dialogue

> **Dev:** "If a **Worker** opens the app, do they see the whole team inbox?"
> **Domain expert:** "No, they only see the scans that have been put into their **Assignments**."

## Flagged ambiguities

- "admin" was used to mean **Team Leader** - resolved: use **Team Leader** as the canonical term.
- "team" was used to mean **Team** - resolved: use **Team** as the shared event boundary.
