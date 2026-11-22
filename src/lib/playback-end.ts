/** Finished, or close enough that pressing play should start over. */
export function atEnd(status: { didJustFinish: boolean; currentTime: number; duration: number }): boolean {
  return status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.25);
}
