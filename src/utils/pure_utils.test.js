import test from "ava";
import { get_vault_rel_from_abs_path } from "./pure_utils.js";

test("get_vault_rel_from_abs_path basic", (t) => {
  const vault_abs_path = "C:/Users/brian/Documents/ObsidianVault";
  const abs_path = "C:/Users/brian/Documents/ObsidianVault/Notes/Note1.md";
  const rel_path = get_vault_rel_from_abs_path(vault_abs_path, abs_path);
  t.is(rel_path, "Notes/Note1.md");
});

test("get_vault_rel_from_abs_path with ../ in abs_path", (t) => {
  const vault_abs_path = "C:/Users/brian/Documents/ObsidianVault";
  const abs_path = "C:/Users/brian/Documents/code/Subfolder/Note1.md";
  const rel_path = get_vault_rel_from_abs_path(vault_abs_path, abs_path);
  t.is(rel_path, "../code/Subfolder/Note1.md");
});

test("get_vault_rel_from_abs_path with multiple ../ in output", (t) => {
  const vault_abs_path = "C:/Users/brian/Documents/ObsidianVault";
  const abs_path = "C:/Users/brian/OtherFolder/Note1.md";
  const rel_path = get_vault_rel_from_abs_path(vault_abs_path, abs_path);
  t.is(rel_path, "../../OtherFolder/Note1.md");
});