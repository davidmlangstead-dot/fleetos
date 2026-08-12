# FleetOS Medic

FleetOS Medic is the internal diagnostic contract for the first production milestone.

## Required checks

- frontend build/deployment identity
- API health and reachability
- Supabase reachability
- authenticated session validity
- tenant/company membership resolution
- database connectivity
- environment/configuration consistency

## Truth rule

Medic must report only checks that were actually executed. Unknown is not PASS.

## Deployment gate

A production deployment should pass the smoke path:

`load -> sign in -> session -> tenant -> dashboard -> refresh -> sign out -> sign in`

No production promotion should be considered verified until this path succeeds against the intended production services.
