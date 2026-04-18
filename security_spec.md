# Security Specification - Family Bible Tracker

## Data Invariants
1. **Group Integrity:** A family group must have a valid `adminUid` (creator) and a name.
2. **Membership Invariant:** Access to a group's logs, comments, and members list is strictly restricted to members of that specific group.
3. **Approval Lifecycle:** Only `approved` members can log readings, confirm others' readings, or comment. `pending` members can only see the group's basic info and their own profile.
4. **Admin Authority:** Only the group admin (creator or promoted admin) can approve/reject members or promote others to admin.
5. **Log Integrity:** Once a log is confirmed, the confirmation fields (`confirmedByUid`, `confirmerName`) become immutable except for deletions.
6. **Identity Integrity:** Users can only create or update member records that match their own `request.auth.uid`.

## The "Dirty Dozen" Payloads (Denial Tests)

1. **Identity Spoofing (Create Member):**
   ```json
   { "displayName": "Attacker", "role": "member", "status": "approved", "joinedAt": "2026-04-18T10:00:00Z", "uid": "victim_uid" }
   ```
   *Expected: DENY (uid mismatch)*

2. **Privilege Escalation (Join as Admin):**
   ```json
   { "displayName": "Attacker", "role": "admin", "status": "approved", "joinedAt": "2026-04-18T10:00:00Z" }
   ```
   *Expected: DENY (joining users must be 'member' and 'pending')*

3. **Self-Approval (Update Status):**
   ```json
   { "status": "approved" }
   ```
   *Expected: DENY (only admins can change status)*

4. **Status Shortcutting (Create Approved Log):**
   ```json
   { "memberUid": "attacker_uid", "book": "Genesis", "chapter": 1, "readAt": "2026-04-18T10:00:00Z", "confirmedByUid": "admin_uid" }
   ```
   *Expected: DENY (users cannot set confirmations on their own logs during creation)*

5. **Log Poisoning (Invalid Chapter):**
   ```json
   { "memberUid": "attacker_uid", "book": "Genesis", "chapter": -1, "readAt": "2026-04-18T10:00:00Z" }
   ```
   *Expected: DENY (chapter must be >= 1)*

6. **Shadow Fields (Ghost Update):**
   ```json
   { "displayName": "User", "isVerifiedAdmin": true }
   ```
   *Expected: DENY (hasOnly check failed)*

7. **PII Blanket Read (Unauthorized Member Fetch):**
   *Operation: get /groups/9TYSUH/members/victim_uid*
   *Expected: DENY (must be a member of the group)*

8. **Resource Exhaustion (1MB Notes):**
   ```json
   { "memberUid": "attacker_uid", "book": "Genesis", "chapter": 1, "readAt": "2026-04-18T10:00:00Z", "notes": "A".repeat(1024 * 1024) }
   ```
   *Expected: DENY (notes size limit)*

9. **Terminal State Bypass (Modify Confirmed Log):**
   ```json
   { "chapter": 2 }
   ```
   *(On a log that has already been confirmed)*
   *Expected: DENY (confirmed logs are immutable)*

10. **Temporal Integrity (Fake Creation Date):**
    ```json
    { "name": "Fake Group", "adminUid": "uid", "createdAt": "2020-01-01T00:00:00Z" }
    ```
    *Expected: DENY (must use request.time)*

11. **Admin Lockdown (Demote Last Admin):**
    *Operation: update role to 'member' for the only admin*
    *Expected: DENY (app logic prevents, but rules should ideally guard if possible)*

12. **Unverified Email Access:**
    *Operation: Any write*
    *Expected: DENY (if request.auth.token.email_verified != true)*
