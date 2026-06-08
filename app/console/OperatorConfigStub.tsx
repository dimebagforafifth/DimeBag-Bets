/**
 * Placeholder for Agent 2's operator-config pages (Tournaments / Prize Wheel /
 * Missions). Those modules aren't merged yet, so the console shows a clearly-marked
 * "coming soon" tab rather than hiding the section — the operator can see it's planned.
 *
 * // TODO(api): when Agent 2's operator-config pages land, import and mount them here
 * (e.g. <TournamentsPage/>, <WheelConfigPage/>, <MissionsPage/>) in place of this stub.
 * They consume the same shared stores; no money plumbing changes here.
 */
export function OperatorConfigStub() {
  return (
    <div className="con-stub" role="note">
      <h1 className="con-h1">Tournaments &amp; wheel</h1>
      <p className="con-sub">
        Operator-run events — tournaments, a prize wheel, and player missions.
      </p>
      <div className="con-stub-badge">Coming soon</div>
      <p className="con-hint">
        These tools are being built in a parallel workstream and will appear here once ready.
        Nothing to configure yet.
      </p>
    </div>
  )
}
