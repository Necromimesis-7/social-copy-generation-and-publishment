# Overseas Social Content Studio PRD

## 1. Document Info

- Product name: Overseas Social Content Studio
- Version: V1.0
- Date: 2026-03-19
- Status: Approved for MVP development

## 2. Product Summary

Overseas Social Content Studio is a project-based AI content generation web app for overseas social media operations. Each project represents one brand. Users configure brand context, maintain a list of target accounts grouped under platforms, optionally import recent post samples, upload new assets, and generate English social copy tailored to platform and account-specific formats.

The MVP focuses on content generation. Publishing and social account authorization are explicitly out of scope and will be addressed later through integrations such as Zapier or Buffer.

## 3. Background

Teams managing multiple overseas brands often generate social copy from scattered source materials. They need a workflow that:

1. Separates brand contexts cleanly.
2. Reuses historical posts to keep tone consistent.
3. Converts new image or video assets into platform-ready copy quickly.
4. Produces different outputs for different platforms without manual rewriting every time.

Current workflows are usually fragmented across note-taking tools, image folders, spreadsheets, and AI chat windows. This creates slow iteration, inconsistent brand voice, and duplicated work.

## 4. Product Goals

### 4.1 Business Goals

1. Establish a usable MVP for AI-assisted overseas social content generation.
2. Validate whether project-based brand context improves content quality and workflow efficiency.
3. Create a foundation for future publishing integrations.

### 4.2 User Goals

1. Switch between brands quickly.
2. Keep each brand's content style isolated.
3. Generate English social copy from multi-image inputs or a single video.
4. Optionally use recent post samples to guide tone and structure.
5. Receive optimized versions for X, Instagram, TikTok, and YouTube account targets.

### 4.3 Non-Goals for MVP

1. Auto-publishing to social platforms.
2. Social account OAuth or native platform authorization.
3. Scheduling calendar.
4. Team approval workflows.
5. Analytics and reporting.
6. Comment reply generation.
7. Multi-video upload in one generation task.

## 5. Users

### 5.1 Primary User

Overseas social media operator managing one or more brand accounts.

### 5.2 Secondary Users

1. Small content teams handling multiple client brands.
2. Founders or marketers managing their own brand presence.

## 6. Scope

### 6.1 In Scope

1. Project creation, editing, deletion, and switching.
2. Brand-level context storage.
3. Target-account configuration per project, including multiple accounts on the same platform.
4. Optional sample import by link and manual text entry.
5. Image and video asset upload.
6. AI generation using brand context, samples, and assets.
7. Account-specific output views.
8. Generation history and reusable records.

### 6.2 Out of Scope

1. Post publishing workflows.
2. Platform API credentials.
3. User permissions and multi-user collaboration.
4. Billing.
5. Large-scale media processing pipelines.

## 7. Key Assumptions

1. One project maps to one brand only.
2. Historical content samples are optional.
3. English is the only UI-exposed output language in MVP.
4. Architecture should remain ready for future multilingual expansion.
5. Users may upload multiple images or one video in a single generation request.
6. Supported platforms in MVP are X, Instagram, TikTok, and YouTube.
7. A single project may include multiple accounts on the same platform.
8. YouTube output is Title + Description, not community post content.
9. TikTok output is Caption only.

## 8. Core Concepts

### 8.1 Project

A project is the top-level workspace for one brand. It stores:

1. Brand metadata.
2. Target-account settings.
3. Historical content samples.
4. Uploaded assets.
5. Generation records.

### 8.2 Platform And Account

A platform is the channel type an account belongs to. The actual generation target is an account configured inside a project. MVP platforms:

1. X
2. Instagram
3. TikTok
4. YouTube

Each project can contain multiple accounts, and multiple accounts may belong to the same platform. Account configuration in MVP means content-generation preferences only. It does not mean native platform connection.

### 8.3 Historical Content Sample

A historical sample is a recent post reference used to shape new copy. It can come from:

1. A supplied social post URL.
2. Manual pasted text.
3. An optional account binding.

Samples remain optional to avoid blocking cold-start usage.

### 8.4 Asset

An asset is either:

1. A set of uploaded images.
2. A single uploaded video.

Assets are analyzed to extract themes, subjects, visible text, and content cues.

### 8.5 Generation

A generation is one AI run tied to:

1. One project.
2. A set of selected assets.
3. The current project context.
4. Zero or more relevant historical samples.
5. One or more account targets.

## 9. Core User Flows

### 9.1 Create and Configure Project

1. User creates a project.
2. User enters brand name and brand description.
3. User defines audience, tone, banned phrases, and default language.
4. User creates and configures one or more target accounts.
5. User saves the project.

### 9.2 Import Historical Samples

1. User opens the sample library inside a project.
2. User can add a social link, manual text, or both.
3. System stores source platform, source type, optional account binding, and sample body.
4. Imported samples become available for future generation jobs.

### 9.3 Generate Copy from New Assets

1. User selects a project.
2. User uploads multiple images or one video.
3. User optionally reviews current project samples and settings.
4. User starts generation.
5. System analyzes assets.
6. System combines asset understanding, brand context, and recent sample context.
7. System returns:
   - General draft
   - Selected X account draft
   - Selected Instagram account caption
   - Selected TikTok account caption
   - Selected YouTube account title and description
8. User edits, copies, or saves results.

### 9.4 Reuse Generated Copy

1. User opens generation history.
2. User reviews prior results.
3. User duplicates or refines a previous draft.
4. User exports the final copy to an external publishing workflow later.

## 10. Functional Requirements

### 10.1 Project Management

1. The system shall allow users to create, edit, delete, and switch projects.
2. The system shall isolate project data completely.
3. Each project shall store:
   - Brand name
   - Brand description
   - Target audience
   - Brand tone
   - Default output language
   - Banned phrases
4. The system shall show a project overview dashboard with sample count, asset count, and recent generations.

### 10.2 Account Configuration

1. The system shall allow maintaining multiple target accounts per project.
2. The system shall support multiple accounts on the same platform.
3. Each account configuration should support:
   - Platform
   - Account name
   - Account identifier such as a handle
   - Enabled status
   - Desired length
   - CTA preference
   - Hashtag preference
   - Style notes

### 10.3 Sample Library

1. The system shall allow importing a sample from a social link.
2. The system shall allow manually adding sample text.
3. Link import and manual text entry shall both be optional.
4. The system shall store sample metadata including:
   - Platform
   - Optional account binding
   - Source URL
   - Publish date if available
   - Sample text
   - Import method
5. Sample import failures shall not block generation.

### 10.4 Asset Upload

1. The system shall allow uploading multiple images.
2. The system shall allow uploading one video.
3. The system shall prevent multi-video combinations in one generation task.
4. The system shall display uploaded asset summaries.
5. The system shall preserve the link between assets and generation outputs.

### 10.5 AI Generation

1. The system shall generate English social copy from uploaded assets.
2. The system shall incorporate project-level brand context.
3. The system shall optionally incorporate historical samples when available.
4. The system shall generate multiple candidate outputs.
5. The system shall support account-specific outputs, where the output format is determined by the account's platform:
   - X: post body
   - Instagram: caption
   - TikTok: caption
   - YouTube: title + description
6. The system shall support post-generation refinement actions such as rewrite, shorten, and stronger CTA.

### 10.6 Result Management

1. The system shall store generation history.
2. The system shall allow viewing results by account.
3. The system shall allow manual edits before saving.
4. The system shall allow copying individual outputs.
5. The system shall allow marking a preferred version.

## 11. Platform Output Requirements

### 11.1 X

- Output shape: post body
- Goal: concise, strong point of view or clear information density
- Typical constraints: short form, direct hook, optional CTA

### 11.2 Instagram

- Output shape: caption
- Goal: visual storytelling and stronger brand voice
- Typical constraints: smoother tone, emotional framing, optional hashtags

### 11.3 TikTok

- Output shape: caption
- Goal: short, quick, native-feeling caption for short-form video
- Typical constraints: direct hook, light tone, fast readability

### 11.4 YouTube

- Output shape: title + description
- Goal: click-driving title and informative description
- Typical constraints: title must be skimmable, description must provide context and CTA

## 12. UX Requirements

### 12.1 Main Screens

1. Project switcher / dashboard
2. Project settings
3. Sample library
4. Asset upload and generation workspace
5. Results view
6. Generation history

### 12.2 UX Principles

1. Project switching must be fast and obvious.
2. Optional sample entry must not create friction.
3. Uploading assets should feel central to the workflow.
4. Platform and account differences should be visible in both configuration and results.
5. Empty states must support cold-start users with no samples yet.

## 13. Information Architecture

### 13.1 Top-Level Navigation

1. Projects
2. Generate
3. Sample Library
4. History
5. Settings

### 13.2 Screen Responsibilities

#### Projects

- Brand-level summary
- Project switching
- Quick stats

#### Generate

- Asset input
- Brand snapshot
- Account targets
- Generate action
- Result tabs

#### Sample Library

- Add link
- Add manual sample
- Review imported samples

#### History

- List prior generation runs
- Reopen and duplicate results

#### Settings

- Brand details
- Default language
- Banned phrases
- Account list and account preferences

## 14. Detailed Screen Requirements

### 14.1 Project Dashboard

Must show:

1. Current project name
2. Brand summary
3. Enabled accounts
4. Recent sample count
5. Recent generation count
6. Shortcut to new generation

### 14.2 Sample Library

Must support:

1. Adding a sample link
2. Pasting manual sample text
3. Assigning a source platform
4. Optionally binding the sample to a source account
5. Reviewing recent samples
6. Viewing whether the sample came from link import or manual input

### 14.3 Generate Workspace

Must support:

1. Uploading multiple images
2. Uploading one video
3. Displaying the selected project context
4. Showing enabled accounts and selected generation accounts
5. Triggering generation
6. Displaying account-specific outputs

### 14.4 Result Detail

Must support:

1. Candidate view
2. Inline editing
3. Copy actions
4. Preferred-result marking
5. Metadata view showing related assets, samples, and target accounts

## 15. Data Model Draft

### 15.1 Project

| Field | Type | Notes |
| --- | --- | --- |
| id | string | primary key |
| name | string | brand/project name |
| brand_summary | text | short description |
| audience | text | target audience |
| tone | string | brand voice |
| default_language | string | default `en`, extensible |
| banned_phrases | text[] | optional |
| created_at | datetime | |
| updated_at | datetime | |

### 15.2 ProjectAccount

| Field | Type | Notes |
| --- | --- | --- |
| id | string | primary key |
| project_id | string | foreign key |
| platform | enum | `x`, `instagram`, `tiktok`, `youtube` |
| account_name | string | account display name |
| handle | string | account handle or identifier |
| enabled | boolean | |
| preferred_length | string | short / medium / long |
| cta_enabled | boolean | |
| hashtag_enabled | boolean | |
| style_notes | text | optional |
| created_at | datetime | |
| updated_at | datetime | |

### 15.3 ContentSample

| Field | Type | Notes |
| --- | --- | --- |
| id | string | primary key |
| project_id | string | foreign key |
| source_platform | enum | optional |
| import_method | enum | `link`, `manual` |
| source_url | string | optional |
| published_at | datetime | optional |
| body | text | required when stored |
| account_id | string | optional target account reference |
| account_label | string | optional account snapshot label |
| created_at | datetime | |

### 15.4 Asset

| Field | Type | Notes |
| --- | --- | --- |
| id | string | primary key |
| project_id | string | foreign key |
| asset_type | enum | `image`, `video` |
| file_name | string | |
| mime_type | string | |
| size_bytes | number | |
| extracted_summary | text | optional |
| created_at | datetime | |

### 15.5 GenerationRun

| Field | Type | Notes |
| --- | --- | --- |
| id | string | primary key |
| project_id | string | foreign key |
| prompt_language | string | default `en` |
| status | enum | `draft`, `completed`, `failed` |
| asset_mode | enum | `multi_image`, `single_video` |
| created_at | datetime | |
| completed_at | datetime | optional |

### 15.6 GenerationAsset

| Field | Type | Notes |
| --- | --- | --- |
| generation_id | string | foreign key |
| asset_id | string | foreign key |

### 15.7 GenerationOutput

| Field | Type | Notes |
| --- | --- | --- |
| id | string | primary key |
| generation_id | string | foreign key |
| platform | enum | `general`, `x`, `instagram`, `tiktok`, `youtube` |
| account_id | string | optional, empty for general drafts |
| account_label | string | optional account snapshot label |
| candidate_index | number | |
| title | text | used by YouTube only |
| body | text | caption, post body, or description |
| is_preferred | boolean | |
| created_at | datetime | |

## 16. API Draft

### 16.1 Project APIs

1. `GET /api/projects`
2. `POST /api/projects`
3. `PATCH /api/projects/:id`
4. `DELETE /api/projects/:id`

### 16.2 Account APIs

1. `GET /api/projects` returns each project's embedded account list
2. `PUT /api/projects/:id` updates the account list together with the project payload

### 16.3 Sample APIs

1. `GET /api/projects/:id/samples`
2. `POST /api/projects/:id/samples`
3. `DELETE /api/projects/:id/samples/:sampleId`

### 16.4 Asset APIs

1. `POST /api/projects/:id/assets`
2. `GET /api/projects/:id/assets`

### 16.5 Generation APIs

1. `POST /api/projects/:id/generations`
2. `GET /api/projects/:id/generations`
3. `GET /api/generations/:generationId`
4. `PATCH /api/outputs/:outputId`

## 17. Prompting and Generation Strategy Draft

The generation pipeline should combine four layers:

1. Brand context layer
   - brand summary
   - audience
   - tone
   - banned phrases
2. Account context layer
   - platform
   - account name / handle
   - account-level style notes
   - length, CTA, and hashtag preferences
3. Sample style layer
   - recent samples
   - preferred structure
   - recurring phrasing patterns
4. Asset understanding layer
   - scene summary
   - subjects
   - OCR text
   - likely use case

Generation should first produce a general English draft, then transform it into account-specific outputs.

## 18. Error and Empty-State Handling

1. No samples present:
   - show a clear message that generation still works
2. Link parsing fails:
   - preserve manual sample flow and show non-blocking warning
3. User uploads multiple videos:
   - reject with clear explanation
4. No account enabled:
   - block generation and ask user to enable at least one account

## 19. Non-Functional Requirements

1. Strong project-level data isolation.
2. Traceability between inputs and outputs.
3. Clear, recoverable error messaging.
4. Architecture ready for future multilingual support.
5. Extensible output schema for publishing integrations.

## 20. Success Metrics for MVP

1. User can create and switch projects successfully.
2. User can complete the generate flow with no samples provided.
3. User can generate outputs for selected target accounts.
4. User can review and copy generated content without leaving the app.
5. At least one generation record is restorable from history.

## 21. Suggested Delivery Phases

### Phase 1

1. PRD
2. Frontend prototype
3. Mock data and local state

### Phase 2

1. Real backend and persistence
2. File storage
3. AI generation API integration

### Phase 3

1. Link parsing improvements
2. Prompt optimization
3. External publishing integrations
