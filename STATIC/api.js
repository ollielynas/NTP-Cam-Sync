window.current_project = "";
window.current_day = "";
window.current_scene = "";
window.current_take = "";
window.current_operator = "";
window.last_change = "-1";
window.get_metadata_value = async (key) => {
  try {
    const response = await fetch("/get/" + key);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const result = await response.text();
    return result;
  } catch (error) {
    return error.message;
  }
};

window.add_to_metadata_array = async (key) => {
  let value = prompt(`you are adding a value to "${key.replace("-", " ")}"`);
  if (value !== "") {
    let vals = (await window.get_metadata_value(key)).split(";");
    vals.push(value);
    window.set_metadata_value(key, vals.join(";"));
  }
};
window.get_metadata_array = async (key) => {
  let vals = (await window.get_metadata_value(key)).split(";");
  return vals;
};

window.set_metadata_value = async (key, value) => {
  try {
    const response = await fetch(
      "/set/" + key + "/" + value + "/" + (Date.now() + window.serverOffset),
    );
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }
  } catch (error) {
    console.log(error.message);
  }
};

window.update_values_from_server = async () => {
  // TODO: combien these so that they dont require one request each

  if ((await get_metadata_value("last_change")) === window.last_change) {
    return;
  }
  window.last_change = await get_metadata_value("last_change");

  window.current_project = await get_metadata_value("project");
  window.project_options = await get_metadata_value("project_options");
  window.current_day = await get_metadata_value("day");
  window.current_scene = await get_metadata_value("scene");
  window.current_take = await get_metadata_value("take");

  const dayElem = document.getElementById("current-day");
  const filesElem = document.getElementById("file-list");
  const sceneElem = document.getElementById("current-scene");
  const projectElem = document.getElementById("current-project");
  const takeElem = document.getElementById("current-take");
  const opElem = document.getElementById("current-operator");

  opElem.innerText = "current operator: " + window.current_operator;
  dayElem.innerText = "current day: " + window.current_day;
  sceneElem.innerText = "current scene: " + window.current_scene;
  projectElem.innerText = "current project: " + window.current_project;
  takeElem.innerText = "current take: " + window.current_take;

  filesElem.innerHTML = (await getAllRecordings())
    .map(
      (r) =>
        `<a onclick="if (confirm('would you like to download ${r.name}?')) {window.downloadRecording(${r.id})}">${r.name}</a>`,
    )
    .join("<br>");

  let elem_ids = ["project-dropdown", "scene-dropdown", "operator-dropdown"];
  let metadata_names = ["project_options", "scene_options", "operator_options"];
  for (let i = 0; i < elem_ids.length; i++) {
    let Elem = document.getElementById(elem_ids[i]);
    let new_text = "";
    let array = await window.get_metadata_array(metadata_names[i]);
    array.reverse();
    for (let val of array) {
      new_text = new_text + `<option value="${val}">${val}</option>`;
    }
    if (Elem.innerHTML.split("=").length != new_text.split("=").length) {
      Elem.innerHTML = new_text;
    }
  }
};

setInterval(update_values_from_server, 1000);

window.send_admin_settings_update = () => {
  let new_project_elem = document.getElementById("project-dropdown");
  let new_project =
    new_project_elem.options[new_project_elem.selectedIndex].text;

  let new_scene_elem = document.getElementById("scene-dropdown");
  let new_scene = new_scene_elem.options[new_scene_elem.selectedIndex].text;

  let new_day_elem = document.getElementById("day-input");
  let new_day = new_day_elem.value;

  let new_take_elem = document.getElementById("take-input");
  let new_take = new_take_elem.value;

  let metadata_names = ["project", "scene", "day", "take"];
  let new_values = [new_project, new_scene, new_day, new_take];
  let old_values = [
    window.current_project,
    window.current_scene,
    window.current_day,
    window.current_take,
  ];
  let alert_text = "Please confirm the following changes:";
  for (let i = 0; i < new_values.length; i++) {
    if (new_values[i] != old_values[i]) {
      alert_text =
        alert_text +
        `\n ${metadata_names[i]}: ${old_values[i]} => ${new_values[i]}`;
    }
  }
  if (alert_text === "Please confirm the following changes:") {
    alert("no changes have been made");
  } else {
    if (confirm(alert_text)) {
      for (let i = 0; i < new_values.length; i++) {
        if (new_values[i] != old_values[i]) {
          window.set_metadata_value(metadata_names[i], new_values[i]);
        }
      }
    }
  }
};

window.save_operator_changes = () => {
  let e = document.getElementById("operator-dropdown");
  if (
    confirm(
      `change current operator from "${window.current_operator}" to "${e.options[e.selectedIndex].text}"?`,
    )
  ) {
    window.current_operator =
      document.getElementById("operator-dropdown").options[
        document.getElementById("operator-dropdown").selectedIndex
      ].text;
    const opElem = document.getElementById("current-operator");
    opElem.innerText = "current operator: " + window.current_operator;
  }
};

(async () => {
  document.getElementById("day-input").innerText =
    await window.get_metadata_value("day");
  document.getElementById("take-input").innerText =
    await window.get_metadata_value("scene");
})();
