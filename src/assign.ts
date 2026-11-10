import { ObjectId } from "mongodb";
import { collections, type Assignment } from "./db.js";


export type AssignResult =
  | { kind: "assigned"; assignment: Assignment }
  | { kind: "judge-busy" } // the judge already holds a QUEUED assignment
  | { kind: "none-available" }; // no project is eligible for this judge right now

/**
 * TODO: implement. See the README for the rules.
 *
 * `judgeId` is already validated to exist by the route. Use `collections()` from ./db.js.
 * Add any helpers you need.
 */
export async function assignNext(judgeId: string): Promise<AssignResult> {
  const { projects, assignments } = collections();
  const busy = await assignments.findOne({ judgeId, status: "QUEUED" });
  if (busy) return { kind: "judge-busy" };
   
  //rule 1: projects this judge has ever had + rule 2: projects someone is judging right now
  const seen = await assignments.distinct("projectId", { judgeId });
  const queued = await assignments.distinct("projectId", { status: "QUEUED" });

  // everything else is a candidate, and rule 5: if nothing is available
  const available = await projects.find({ _id: { $nin: [...seen, ...queued] } }).toArray();
  if (available.length === 0) return { kind: "none-available" };

  // rule 3: count completed assignments for each candidate
  const counts = await assignments
    .aggregate<{ _id: string; n: number }>([
      { $match: { status: "COMPLETED", projectId: { $in: available.map((p) => p._id) } } },
      { $group: { _id: "$projectId", n: { $sum: 1 } } },
    ])
    .toArray();
  const completed = new Map(counts.map((c) => [c._id, c.n]));

  // dealing w projects that arent completed
  const scored = available.map((p) => ({ id: p._id, n: completed.get(p._id) ?? 0 }));
  const min = Math.min(...scored.map((s) => s.n));
  const tied = scored.filter((s) => s.n === min);
  const chosen = tied[Math.floor(Math.random() * tied.length)].id; // random tie-break

  console.log("[assign]", judgeId, { seen, queued, scored, chosen }); // remove before submitting

  const assignment: Assignment = {
    _id: new ObjectId(),
    judgeId,
    projectId: chosen,
    status: "QUEUED",
    createdAt: new Date(),
  };
  await assignments.insertOne(assignment);
  return { kind: "assigned", assignment };


}
