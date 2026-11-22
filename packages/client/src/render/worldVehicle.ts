// The stage message names a course, not a vehicle: the story's race and its camp are the buggy's, the lobby's vehicle is the villa's and the outings'.
export function worldVehicleId(courseId: string, lobbyVehicleId: string, story: boolean): string {
  return story && (courseId === 'agafay' || courseId === 'camp') ? 'buggy' : lobbyVehicleId;
}
