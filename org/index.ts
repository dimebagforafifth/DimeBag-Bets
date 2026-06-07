/**
 * Public surface of the organisation hierarchy (the player-management system).
 * The app/admin UI imports from here; member money still flows through `core`.
 */

export type { Role, Member, MemberProfile, Org } from './types.js'
export type { NewMember, Settlement } from './org.js'
export {
  ROLE_TIER,
  createOrg,
  getMember,
  addMember,
  addSubAgent,
  addAgent,
  addPlayer,
  eligibleParents,
  directReports,
  directPlayers,
  membersByRole,
  downline,
  playerCount,
  bookFigure,
  bookPending,
  allocatedCredit,
  availableCredit,
  creditUtilization,
  setCreditLimit,
  setActive,
  setMaxWager,
  setMinWager,
  setMaxPayout,
  setBettingLocked,
  setBookBettingLocked,
  setMemberProfile,
  renameMember,
  removeMember,
  reassign,
  settlementStatement,
  settleOrgWeek,
} from './org.js'
