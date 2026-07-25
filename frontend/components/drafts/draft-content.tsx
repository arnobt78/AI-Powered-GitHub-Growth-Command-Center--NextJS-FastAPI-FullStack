import { Clock, Sparkles } from "lucide-react";
import type {
  DraftKind,
  MissingDocSuggestionContent,
  ReadmeSuggestionContent,
  SeoSuggestionContent,
  TopicSuggestionContent,
} from "@/types/drafts";
import { Chip } from "@/components/ui/chip";

function Reason({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <p className="mt-2 text-xs text-muted-foreground">{reason}</p>;
}

// Shared by every kind's "Current"/"Suggested" field pair below instead of
// repeating the same label markup per kind.
function FieldLabel({ variant, children }: { variant: "current" | "suggested"; children: string }) {
  const Icon = variant === "current" ? Clock : Sparkles;
  const iconColor = variant === "current" ? "text-muted-foreground" : "text-violet-500";
  return (
    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon className={`h-3 w-3 ${iconColor}`} aria-hidden="true" />
      {children}
    </p>
  );
}

function isReadmeSuggestion(c: unknown): c is ReadmeSuggestionContent {
  return typeof c === "object" && c !== null && typeof (c as ReadmeSuggestionContent).suggested === "string" && "current" in c;
}

function isMissingDocSuggestion(c: unknown): c is MissingDocSuggestionContent {
  return typeof c === "object" && c !== null && typeof (c as MissingDocSuggestionContent).suggested === "string" && !("current" in c);
}

function isTopicSuggestion(c: unknown): c is TopicSuggestionContent {
  return typeof c === "object" && c !== null && Array.isArray((c as TopicSuggestionContent).suggested) && Array.isArray((c as TopicSuggestionContent).current);
}

function isSeoSuggestion(c: unknown): c is SeoSuggestionContent {
  return typeof c === "object" && c !== null && typeof (c as SeoSuggestionContent).suggested_description === "string";
}

export function DraftContent({ kind, content }: { kind: DraftKind | string; content: unknown }) {
  if (kind === "readme_suggestion" && isReadmeSuggestion(content)) {
    return (
      <div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel variant="current">Current</FieldLabel>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
              {content.current ?? "(no README yet)"}
            </pre>
          </div>
          <div>
            <FieldLabel variant="suggested">Suggested</FieldLabel>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">{content.suggested}</pre>
          </div>
        </div>
        <Reason reason={content.reason} />
      </div>
    );
  }

  if (kind === "missing_doc_suggestion" && isMissingDocSuggestion(content)) {
    return (
      <div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">{content.suggested}</pre>
        <Reason reason={content.reason} />
      </div>
    );
  }

  if (kind === "release_notes" && isMissingDocSuggestion(content)) {
    return (
      <div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">{content.suggested}</pre>
        <Reason reason={content.reason} />
      </div>
    );
  }

  if (kind === "issue_reply" && isMissingDocSuggestion(content)) {
    return (
      <div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">{content.suggested}</pre>
        <Reason reason={content.reason} />
      </div>
    );
  }

  if (kind === "discussion_reply" && isMissingDocSuggestion(content)) {
    return (
      <div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">{content.suggested}</pre>
        <Reason reason={content.reason} />
      </div>
    );
  }

  if (kind === "topic_suggestion" && isTopicSuggestion(content)) {
    return (
      <div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel variant="current">Current</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {content.current.length > 0
                ? content.current.map((topic, i) => <Chip key={`${topic}-${i}`}>{topic}</Chip>)
                : <p className="text-xs text-muted-foreground">(no topics yet)</p>}
            </div>
          </div>
          <div>
            <FieldLabel variant="suggested">Suggested</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {content.suggested.map((topic, i) => (
                <Chip key={`${topic}-${i}`}>{topic}</Chip>
              ))}
            </div>
          </div>
        </div>
        <Reason reason={content.reason} />
      </div>
    );
  }

  if (kind === "seo_suggestion" && isSeoSuggestion(content)) {
    return (
      <div className="space-y-1.5 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel variant="current">Current</FieldLabel>
            <p className="text-sm">{content.current ?? "(no description yet)"}</p>
          </div>
          <div>
            <FieldLabel variant="suggested">Suggested</FieldLabel>
            <p className="text-sm">{content.suggested_description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {content.keywords.map((keyword, i) => (
            <Chip key={`${keyword}-${i}`}>{keyword}</Chip>
          ))}
        </div>
        <Reason reason={content.reason} />
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">{JSON.stringify(content)}</p>;
}
