import { useId } from "react";
import { ROUTE_PROFILE_IDS, type RouteProfileId } from "../api/types.ts";
import { PROFILE_INFO } from "../lib/routeInsight.ts";

/** Fast, balanced or safe: how the route trades length against slope. Changing it asks for a new route. */
export function ProfileSelector({ value, onChange }: { value: RouteProfileId; onChange: (profile: RouteProfileId) => void }) {
  const name = useId();
  return (
    <fieldset className="profile">
      <legend className="stat__label">Route profile</legend>
      <div className="profile__options">
        {ROUTE_PROFILE_IDS.map((id) => (
          <label key={id} className="profile__option">
            <input type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} />
            <span>{PROFILE_INFO[id].label}</span>
          </label>
        ))}
      </div>
      <p className="profile__hint">{PROFILE_INFO[value].hint}</p>
    </fieldset>
  );
}
