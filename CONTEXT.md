# PMW HR Forms

PMW HR Forms is the HR portal context for employee form submission, approval workflows, career administration, and form definition management.

## Language

**HR Forms Owner**:
An HR portal administrator who can review submissions, manage admin workspaces, and operate HR administration tools.
_Avoid_: Admin when referring specifically to form definition access

**Form Builder Superuser**:
A trusted HR Forms Owner who can create and edit form definitions. Every Form Builder Superuser is an HR Forms Owner, but not every HR Forms Owner is a Form Builder Superuser.
_Avoid_: Form admin, builder admin

**Layer Sequence**:
The ordered workflow a submitted form moves through for approval or evaluation. A form can have no layer sequence, one fixed sequence, or different sequences depending on the selected branch.
_Avoid_: Assuming every workflow has exactly one approval layer

**Manual Branch**:
A named branch-specific layer sequence selected after submission when manual branching is enabled. Used for workflow variants such as managerial and non-managerial approval paths.
_Avoid_: Treating branches as extra layers inside the main sequence

**Department Approver Lookup**:
An approval/evaluation layer assignee that reads the submitted department value and resolves the approver email from the SharePoint list `Department Approver Directory`. Department values must match exactly.
_Avoid_: Tenant-wide user search, free-text manager name field, SharePoint Person column

**Layer Actor**:
A person allowed to approve or evaluate one layer. A layer can have several — named individually or expanded from a distribution list — and any one of them completes it; the first decision wins.
_Avoid_: Assuming one layer means one approver, or that every actor must act

**Notification Mailbox**:
An address that receives a layer's notification email without being able to act on it, typically a shared or team mailbox. The approval or evaluation still belongs to the layer's actors and is recorded against whoever decided.
_Avoid_: Treating the mailbox as the assignee, or letting it approve

**Managed Company Selector**:
A required, single-select company question controlled from Form Setup and presented in the form header. It represents the company the submission belongs to.
_Avoid_: Company banner, duplicate Company field

**Public Respondent**:
A person who submits a public form without signing in to Microsoft 365.
_Avoid_: Treating a Public Respondent as a tenant user or resolving tenant identity for them

**Public Submission Signature Link**:
The response-list value that points from a Public Respondent's signature field to the stored signature image. The signature is incomplete unless this link is saved on the submitted response.
_Avoid_: Treating an uploaded signature image by itself as a saved response signature

**Test Run**:
A rehearsal submission through a form's real layer sequence, where every email is
redirected to one address the tester nominates. It is flagged on the response
row, hidden from production listings by default, and carries a pass/fail
checklist of every step it took.
_Avoid_: Treating a test run as a real submission, or calling a preview of the
form a test run
