# Form Builder Enhancement Plan

## Phase 1: DynamicMatrix Separate SharePoint List
**Design** → Oracle consultation (in progress)
**Implementation**: formBuilderSP.ts, DynamicFormPage.tsx, api/submit-form.ts, ResponseViewer.tsx, EvaluationPage.tsx
**Status**: BLOCKED on Oracle result

## Phase 2: Per-Type Property Panel Features
### Unit 2A: Currency enhancements
- Add `currencySymbol` prop (editable, not hardcoded MYR)
- Add `decimalPlaces` prop (0-4)
- Update mapFieldToSurveyJs to use configured symbol via SurveyJS `currency` displayStyle
- Update FormBuilder.tsx property panel
**Files**: FormBuilderEngine.ts (QUESTION_TYPES + mapFieldToSurveyJs), FormBuilder.tsx (FieldTypeProps)
**Status**: READY

### Unit 2B: Number/Display format enhancements
- Add `displayFormat` (0, 0.0, 0.00) to number type
- Add `prefix`/`suffix` to number type
- Add `defaultValue` to counter, slider, duration
- Update mapFieldToSurveyJs to pass format to SurveyJS
**Files**: FormBuilder.tsx (FieldTypeProps), FormBuilderEngine.ts (mapFieldToSurveyJs)
**Status**: READY

### Unit 2C: Ranking SP column mapping
- Change spColumnKind from null to 3 (Note/Multi-line) for ranking type
- Ranking data is an ordered array — stored as JSON string in Note column
**Files**: FormBuilderEngine.ts (QUESTION_TYPES)
**Status**: READY

### Unit 2D: Email/Tel/Password validation
- Add `multiple` flag to email type
- Add `pattern` regex to tel/password types
**Files**: FormBuilder.tsx (FieldTypeProps)
**Status**: READY

## Phase 3: File Upload to Document Library
- Create <FormTitle> Files doc library during publish
- Upload files via SharePoint REST API
- Store file URL in response list column
- Handle guest upload via API
**Status**: NOT STARTED

## Phase 4: Display Improvements
- Phase 4A: ResponseViewer child list data rendering
- Phase 4B: EvaluationPage child list data rendering
- Phase 4C: PDF generation with child list data
**Status**: NOT STARTED
