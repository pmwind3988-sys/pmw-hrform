import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Survey } from "survey-react-ui";
import { Model } from "survey-core";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import {
  Box,
  CircularProgress,
  Alert,
  Typography,
  Container,
  Paper,
  Button,
} from "@mui/material";
import { createSpClient } from "../utils/sharepointClient";
import type { FormConfig, SurveyJson } from "../types";

interface DynamicFormPageProps {
  // No props - uses router params
}

export function DynamicFormPage(_props: DynamicFormPageProps) {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [surveyModel, setSurveyModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    const loadForm = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!formId) {
          throw new Error("No form ID provided");
        }

        // Create SP client
        const spClient = createSpClient(instance, accounts);

        // Fetch form config from Master Form list
        const configItems = await spClient.queryList("Master Form", {
          filter: `FormID eq '${formId}'`,
          top: 1,
        });

        if (!configItems || configItems.length === 0) {
          throw new Error("Form not found");
        }

        const configItem = configItems[0];
        const config: FormConfig = {
          Title: String(configItem.Title || ""),
          FormID: String(configItem.FormID || formId),
          NumberOfApprovalLayer: Number(configItem.NumberOfApprovalLayer) || 0,
          Slug: String(configItem.Slug || ""),
          CurrentVersion: String(configItem.CurrentVersion || "1"),
          IsPublished: Boolean(configItem.IsPublished),
          IsPublic: Boolean(configItem.IsPublic),
          ConditionField: configItem.ConditionField ? String(configItem.ConditionField) : undefined,
          ApprovalRules: configItem.ApprovalRules ? String(configItem.ApprovalRules) : undefined,
        };

        setFormConfig(config);

        // Check if form requires authentication
        if (!config.IsPublic && !isAuthenticated) {
          setError("This form requires authentication. Please sign in to access it.");
          setLoading(false);
          return;
        }

        // Fetch the survey JSON from Form Templates list
        const versionItems = await spClient.queryList("Form Templates", {
          filter: `FormID eq '${formId}' and FormVersion eq '${config.CurrentVersion}'`,
          top: 1,
        });

        let surveyJson: SurveyJson | undefined;

        if (versionItems && versionItems.length > 0) {
          const versionItem = versionItems[0];
          try {
            const jsonString = versionItem.SurveyJSON || versionItem.surveyJson;
            if (jsonString) {
              surveyJson = JSON.parse(String(jsonString)) as SurveyJson;
            }
          } catch {
            throw new Error("Failed to parse form configuration");
          }
        }

        if (!surveyJson) {
          throw new Error("Form configuration not found");
        }

        const survey = new Model(surveyJson);
        survey.applyTheme({});
        setSurveyModel(survey);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load form");
      } finally {
        setLoading(false);
      }
    };

    loadForm();
  }, [formId, instance, accounts, isAuthenticated]);

  const handleSurveyComplete = async (sender: Model, _options: unknown) => {
    try {
      setSubmitting(true);
      setError(null);

      if (!formId || !formConfig) {
        throw new Error("Form configuration missing");
      }

      const spClient = createSpClient(instance, accounts);

      // Build the submission data
      const submissionData: Record<string, unknown> = {
        Title: `Submission - ${new Date().toISOString()}`,
        FormID: formId,
        FormVersion: formConfig.CurrentVersion || "1",
        FormStatus: "Pending",
        ...sender.data,
      };

      // Submit to the appropriate list
      const listTitle = formConfig.Title || formId;

      // Check if list exists
      const listExists = await spClient.listExists(listTitle).catch(() => false);

      if (!listExists) {
        throw new Error("Submission list not found. Please contact administrator.");
      }

      // Add the submission
      await spClient.upsertListItem(listTitle, `FormID eq '${formId}'`, submissionData);

      setSubmitSuccess(true);

      // Complete the survey
      sender.completeLastPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit form");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          gap: 2,
        }}
      >
        <CircularProgress size={48} sx={{ color: "#0078D4" }} />
        <Typography variant="body1" color="text.secondary">
          Loading form...
        </Typography>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        {!isAuthenticated && error.includes("authentication") && (
          <Button
            variant="contained"
            onClick={() => instance.loginRedirect()}
            sx={{ mt: 2 }}
          >
            Sign In
          </Button>
        )}
        <Button
          variant="outlined"
          onClick={() => navigate(-1)}
          sx={{ mt: 2, ml: 2 }}
        >
          Go Back
        </Button>
      </Container>
    );
  }

  // Form not found
  if (!formConfig) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Alert severity="warning">
          Form not found
        </Alert>
        <Button
          variant="outlined"
          onClick={() => navigate(-1)}
          sx={{ mt: 2 }}
        >
          Go Back
        </Button>
      </Container>
    );
  }

  // Success state
  if (submitSuccess) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Paper elevation={0} sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <Alert severity="success" sx={{ mb: 3 }}>
            Form submitted successfully!
          </Alert>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Your submission has been received and is being processed.
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate("/")}
            sx={{ borderRadius: 2 }}
          >
            Return to Home
          </Button>
        </Paper>
      </Container>
    );
  }

  // Form rendering
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={0} sx={{ p: { xs: 2, md: 4 }, borderRadius: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 300 }}>
          {formConfig.Title || "Form"}
        </Typography>
        {surveyModel && (
          <Box sx={{ mt: 3 }}>
            <Survey
              model={surveyModel}
              onComplete={handleSurveyComplete}
            />
          </Box>
        )}
        {submitting && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
            <CircularProgress size={32} sx={{ color: "#0078D4" }} />
          </Box>
        )}
      </Paper>
    </Container>
  );
}
