import Link from "next/link";
import SignOutButton from "@/components/sign-out-button";
import ThemePicker from "@/components/theme-picker";

export type ProfileData = {
  id: string;
  name: string;
  email: string;
  superAdmin: boolean;
  memberSince: string;
  tvCount: number;
  liveCount: number;
  tvsHref: string;
};

function initials(name: string) {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

export default function ProfileView({ profile }: { profile: ProfileData }) {
  const role = profile.superAdmin ? "Super admin" : "User";
  return (
    <div className="profile">
      <section className="profile-hero rise">
        <div className="profile-avatar" aria-hidden="true">{initials(profile.name)}</div>
        <div className="profile-identity">
          <div className="eyebrow">My profile</div>
          <h1>{profile.name}</h1>
          <p className="subheading">{profile.email}</p>
        </div>
        <span className={`role-tag ${profile.superAdmin ? "super" : ""}`}>{role}</span>
      </section>

      <div className="profile-stats rise rise-1">
        <Link className="profile-stat" href={profile.tvsHref}><span className="metric-label">{profile.superAdmin ? "TVs across all users" : "TVs paired"}</span><span className="metric-value">{profile.tvCount}</span></Link>
        <Link className="profile-stat" href={profile.tvsHref}><span className="metric-label">Live now</span><span className="metric-row"><span className="metric-dot" /><span className="metric-value">{profile.liveCount}</span></span></Link>
        <div className="profile-stat"><span className="metric-label">Member since</span><span className="profile-stat-text">{profile.memberSince}</span></div>
      </div>

      <div className="profile-grid">
        <section className="profile-card rise rise-2">
          <h2>Account details</h2>
          <dl className="profile-details">
            <div><dt>Name</dt><dd>{profile.name}</dd></div>
            <div><dt>Email</dt><dd>{profile.email}</dd></div>
            <div><dt>Role</dt><dd>{role}</dd></div>
            <div><dt>Account ID</dt><dd className="mono">{profile.id}</dd></div>
          </dl>
        </section>
        <section className="profile-card rise rise-3">
          <h2>Appearance</h2>
          <p className="profile-note">Choose how Spinco Connect looks on this device.</p>
          <ThemePicker />
        </section>
      </div>

      <section className="profile-card profile-session rise rise-4">
        <div><h2>Sign out</h2><p className="profile-note">End your session on this device. Your TVs keep playing their content.</p></div>
        <SignOutButton />
      </section>
    </div>
  );
}
