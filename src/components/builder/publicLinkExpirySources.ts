/**
 * publicLinkExpirySources.ts — which forms a public layer may read its expiry
 * date from, and which of their questions it may point at.
 *
 * A public layer can expire on a date the workflow itself carries rather than
 * one the author fixed in advance. That date does not have to come from the
 * submitted form: it can come from any *earlier* layer's own review form, so
 * layer 3's link can expire off a date layer 2's evaluator filled in.
 *
 * Later layers are never offered. Their answers do not exist while this layer's
 * link is live, so a link pointing at one would simply never expire — a setting
 * that looks configured and does nothing is worse than one that is refused.
 *
 * A branch layer is only offered its own branch's earlier layers, because a
 * layer in a branch the submission did not take never ran for it.
 *
 * What a date is worth at runtime is `api/_utils/layerExpiry.ts`'s business;
 * this module only decides what the author is allowed to choose.
 */
import { flattenQuestions } from "../../utils/FormBuilderEngine";
import type { LayerConfigItem } from "../../types";
import type { LayerFieldOption } from "./layerValidation";

/** The submitted form itself, as opposed to any review layer. */
export const SUBMITTED_FORM_SOURCE_LAYER = 0;

export interface ExpirySourceForm {
  /** 0 is the submitted form; any higher number is an earlier review layer. */
  sourceLayer: number;
  /** How the form is named in the builder, e.g. "Layer 2 — Site inspection". */
  label: string;
  /** How the form is named mid-sentence, e.g. "layer 2's form". */
  description: string;
  questions: LayerFieldOption[];
}

/**
 * Question types whose answer can be read as a date.
 *
 * Pointing an expiry at a free-text question produces a link that never
 * expires, so the builder labels the choice — but it stays selectable, because
 * a form may keep a date in a plain column for reasons this module cannot see.
 */
export function isDateProducingField(field: LayerFieldOption | undefined): boolean {
  if (!field) return false;
  // The builder's own date questions. A Date & Time field is `type: "datetime"`
  // while it is being authored and only becomes `datetime-local` once the form
  // is published, so both spellings have to count — the link reads the date part
  // and ignores the time regardless.
  if (field.type === "datepicker" || field.type === "date" || field.type === "datetime") return true;
  return field.type === "text"
    && (field.inputType === "date"
      || field.inputType === "datetime-local"
      || field.inputType === "datetime");
}

/** Date questions first, so the answer the author almost certainly wants is on top. */
function dateQuestionsFirst(questions: LayerFieldOption[]): LayerFieldOption[] {
  return [
    ...questions.filter((question) => isDateProducingField(question)),
    ...questions.filter((question) => !isDateProducingField(question)),
  ];
}

/** The questions a layer's own review form asks, panels included. */
function layerQuestions(layer: LayerConfigItem): LayerFieldOption[] {
  const elements = layer.type === "evaluation" && Array.isArray(layer.surveyElements)
    ? layer.surveyElements
    : [];
  if (elements.length === 0) return [];

  return flattenQuestions({ pages: [{ name: "layer", elements }] })
    .map((field) => ({
      name: field.name,
      title: typeof field.title === "string" ? field.title : undefined,
      type: field.type,
      inputType: field.inputType,
    }))
    .filter((field) => !!field.name);
}

/**
 * The forms the layer at `index` may read an expiry date from, in the order the
 * builder lists them: the submitted form, then each earlier layer of the same
 * sequence that actually collects answers.
 *
 * `layers` is one sequence — the main one, or a single manual branch.
 *
 * A form with no questions is left out rather than offered empty, so an empty
 * result means "nothing to point at yet" and the builder can say so.
 */
export function expirySourceForms(
  layers: LayerConfigItem[],
  index: number,
  formFields: LayerFieldOption[],
): ExpirySourceForm[] {
  const forms: ExpirySourceForm[] = [];

  const submitted = dateQuestionsFirst(formFields.filter((field) => !!field.name));
  if (submitted.length > 0) {
    forms.push({
      sourceLayer: SUBMITTED_FORM_SOURCE_LAYER,
      label: "Submitted form",
      // Unchanged from before layers could be a source, so the commonest
      // validation message reads exactly as it always has.
      description: "the form",
      questions: submitted,
    });
  }

  layers.slice(0, Math.max(0, index)).forEach((layer, position) => {
    const questions = layerQuestions(layer);
    if (questions.length === 0) return;
    // A layer part-way through being added may not carry its number yet; its
    // place in the sequence is what the runtime will end up calling it.
    const sourceLayer = Number(layer.layerNumber) > 0 ? Number(layer.layerNumber) : position + 1;
    const title = layer.title?.trim();
    forms.push({
      sourceLayer,
      label: title ? `Layer ${sourceLayer} — ${title}` : `Layer ${sourceLayer}`,
      description: `layer ${sourceLayer}'s form`,
      questions: dateQuestionsFirst(questions),
    });
  });

  return forms;
}

/** The form a saved expiry points at, if it is still on offer. */
export function findExpirySourceForm(
  forms: ExpirySourceForm[],
  sourceLayer: number | undefined,
): ExpirySourceForm | undefined {
  return forms.find((form) => form.sourceLayer === (sourceLayer ?? SUBMITTED_FORM_SOURCE_LAYER));
}
