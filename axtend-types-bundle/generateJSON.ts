import { RegistryTypes } from "@axia/types/types";
import fs from "fs";
import { axtendDefinitions } from ".";

async function generateJSON() {
  const version = process.argv[2] || "latest";
  let types: RegistryTypes;
  if (!axtendDefinitions.types) {
    throw new Error("missing types definitions");
  } else if (version === "latest") {
    types = axtendDefinitions.types[axtendDefinitions.types.length - 1].types;
  } else if (Number(version)) {
    let i = 0;
    while (
      i < axtendDefinitions.types.length &&
      axtendDefinitions.types[i].minmax[1] &&
      Number(axtendDefinitions.types[i].minmax[1]) < Number(version)
    ) {
      i += 1;
    }
    types = axtendDefinitions.types[i].types;
  } else {
    throw new Error("parameter must be number or `latest`");
  }
  console.log(JSON.stringify(types));
  fs.appendFile("axtend-types-" + version + ".json", JSON.stringify(types), function (err) {
    if (err) throw err;
    console.log("Saved for version : " + version);
  });
}
generateJSON();
