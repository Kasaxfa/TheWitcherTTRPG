const assert = require("node:assert/strict");
const test = require("node:test");
const Trees = require("../character-profession-trees.js");
const CharacterStore = require("../character-store.js");

test("all nine professions have three branches with three ordered nodes", () => {
  assert.equal(Trees.TREE_LIST.length, 9);
  for (const tree of Trees.TREE_LIST) {
    assert.equal(tree.branches.length, 3, tree.professionId);
    assert.ok(tree.branches.every(branch => branch.nodes.length === 3), tree.professionId);
  }
});

test("a profession branch opens the next rank-zero node when the preceding rank reaches five", () => {
  const character = CharacterStore.createCharacter();
  assert.equal(Trees.getNodeState(character, "criminal", "A", 0).rank, 0);
  assert.equal(Trees.getNodeState(character, "criminal", "A", 1).unlocked, false);
  assert.deepEqual(Trees.setRank(character, "criminal", "A", 0, 5), { ok: true, rank: 5, unlockedNext: true });
  assert.deepEqual(Trees.getNodeState(character, "criminal", "A", 1), { rank: 0, unlocked: true, nextUnlockAt: 5 });
  assert.equal(Trees.setRank(character, "criminal", "A", 1, 5).ok, true);
  assert.equal(Trees.getNodeState(character, "criminal", "A", 2).unlocked, true);
});

test("rank cannot be lowered to relock a node that already has progress", () => {
  const character = CharacterStore.createCharacter();
  Trees.setRank(character, "criminal", "B", 0, 5);
  Trees.setRank(character, "criminal", "B", 1, 1);
  assert.equal(Trees.setRank(character, "criminal", "B", 0, 4).ok, false);
  assert.equal(Trees.getNodeState(character, "criminal", "B", 0).rank, 5);
});
