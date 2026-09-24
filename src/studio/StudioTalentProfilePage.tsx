import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  GraduationCap,
  MapPin,
  MessageSquare,
  Ticket,
} from "lucide-react";
import { Avatar, Button, Card, FormError, Tag } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/features/auth/AuthProvider";
import { MessageTalentModal } from "@/features/messaging/MessageTalentModal";
import { InviteToCastingModal } from "@/studio/InviteToCastingModal";
import { useCurrentOrganization } from "@/features/organizations/queries";
import { can } from "@/lib/access";
import { useTalentProfile } from "@/features/talent/queries";
import { publicUrl } from "@/lib/storage";
import { errorMessage } from "@/lib/supabase";

/**
 * A talent's professional profile as the production side sees it: the public
 * part of their account, read straight from the database. Private material
 * (self-tapes submitted to other castings, team notes) is not reachable here —
 * RLS decides, not the UI.
 */
export function StudioTalentProfilePage() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { profile: me } = useAuth();
  const { organization } = useCurrentOrganization(me?.id);
  const talent = useTalentProfile(profileId);
  const [messaging, setMessaging] = useState(false);
  const [inviting, setInviting] = useState(false);

  if (talent.isLoading || (!talent.data && !talent.error)) {
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!talent.data) {
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
        <FormError>
          {errorMessage(talent.error, "This profile is not available")}
        </FormError>
        <Link
          to="/studio/talent"
          className="text-sm font-semibold text-link hover:underline"
        >
          Back to talent search
        </Link>
      </div>
    );
  }

  const {
    profile,
    talent: details,
    skills,
    languages,
    credits,
    training,
    media,
  } = talent.data;
  const name =
    details.professional_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    "Talent";
  const headshots = media.filter(
    (asset) => asset.kind === "headshot" || asset.kind === "portfolio",
  );

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
      <button
        onClick={() => navigate("/studio/talent")}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Talent
      </button>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar src={profile.avatar_url ?? undefined} name={name} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[1.5rem] font-extrabold tracking-[-0.02em] text-ink">
            {name}
          </h1>
          <p className="mt-0.5 text-[15px] text-muted">
            {details.headline ?? "Talent"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            {(profile.city || profile.country) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {[profile.city, profile.country].filter(Boolean).join(", ")}
              </span>
            )}
            {details.agency_name && <span>{details.agency_name}</span>}
            {details.union_name && <span>{details.union_name}</span>}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {details.gender && <Tag>{details.gender}</Tag>}
            {details.playing_age_min !== null &&
              details.playing_age_max !== null && (
                <Tag>
                  Plays {details.playing_age_min}–{details.playing_age_max}
                </Tag>
              )}
            {details.height_cm && <Tag>{details.height_cm} cm</Tag>}
            {details.experience_level && (
              <Tag tone="cream">{details.experience_level}</Tag>
            )}
            {languages.map((language) => (
              <Tag key={language.code}>{language.name}</Tag>
            ))}
          </div>
        </div>

        {/* Inviter sur un casting sur invitation : c'est ce qui rend cette
            visibilité utilisable depuis l'annuaire. */}
        {can(organization?.role, "casting:publish") && (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            icon={<Ticket className="h-4 w-4" />}
            onClick={() => setInviting(true)}
          >
            Invite to a casting
          </Button>
        )}

        {/* Writing to an actor is allowed at any point — it opens a real thread. */}
        {can(organization?.role, "message:send") && (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            icon={<MessageSquare className="h-4 w-4" />}
            onClick={() => setMessaging(true)}
          >
            Message
          </Button>
        )}
      </Card>

      {inviting && profileId && organization?.id && (
        <InviteToCastingModal
          talent={{ id: profileId, name }}
          orgId={organization.id}
          onClose={() => setInviting(false)}
        />
      )}

      {messaging && profileId && (
        <MessageTalentModal
          talent={{ id: profileId, name, avatarUrl: profile.avatar_url }}
          orgId={organization?.id}
          onClose={() => setMessaging(false)}
        />
      )}

      {details.bio && (
        <Card className="flex flex-col gap-2">
          <span className="tech-label">About</span>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink/90">
            {details.bio}
          </p>
        </Card>
      )}

      {skills.length > 0 && (
        <Card className="flex flex-col gap-3">
          <span className="tech-label">Skills</span>
          <ul className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <li key={skill.skillId}>
                <Tag tone={skill.level === 3 ? "good" : "neutral"}>
                  {skill.name}
                  {skill.level === 3
                    ? " · expert"
                    : skill.level === 1
                      ? " · training"
                      : ""}
                </Tag>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {headshots.length > 0 && (
        <Card className="flex flex-col gap-3">
          <span className="tech-label">Photos</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {headshots.map((asset) => (
              <img
                key={asset.id}
                src={publicUrl(asset.bucket, asset.path)}
                alt=""
                className="aspect-[3/4] w-full rounded-btn object-cover"
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <span className="tech-label inline-flex items-center gap-1.5">
          <Briefcase className="h-4 w-4" />
          Experience
        </span>
        {credits.length === 0 ? (
          <EmptyState compact title="No credit listed" />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {credits.map((credit) => (
              <li key={credit.id} className="py-2.5 first:pt-0">
                <p className="text-[14px] font-semibold text-ink">
                  {credit.role_name ?? "Role"} ·{" "}
                  <span className="text-muted">{credit.title}</span>
                </p>
                <p className="text-[12px] text-muted">
                  {[
                    credit.category,
                    credit.year,
                    credit.company,
                    credit.director && `dir. ${credit.director}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {training.length > 0 && (
        <Card className="flex flex-col gap-3">
          <span className="tech-label inline-flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4" />
            Training
          </span>
          <ul className="flex flex-col gap-2">
            {training.map((entry) => (
              <li key={entry.id}>
                <p className="text-[14px] font-semibold text-ink">
                  {entry.school}
                </p>
                <p className="text-[12px] text-muted">
                  {[
                    entry.program,
                    [entry.start_year, entry.end_year]
                      .filter(Boolean)
                      .join("–"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
