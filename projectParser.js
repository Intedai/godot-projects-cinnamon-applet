const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;

// TODO: Maybe take file instead, since i create in ctor for monitoring
function get_project_list(path) {
    const projectsFile = Gio.File.new_for_path(path);
    if (!projectsFile.query_exists(null)){
        let msg = "Path for projects config file doesn't exist!: " + path;
        Main.notify("Invalid Path", msg);
        global.log("Warning: " + msg);
        return null;
    }
    
    const keyFile = new GLib.KeyFile();
    let groups;

    let projects = {
        favorites: [],
        non_favorites: []
    };

    try {
        keyFile.load_from_file(projectsFile.get_path(), GLib.KeyFileFlags.NONE);
    
        [groups, ] = keyFile.get_groups();

        for(const group of groups) {
            if (keyFile.get_boolean(group, "favorite")) {
                projects.favorites.push(group);
            }
            else {
                projects.non_favorites.push(group);
            }
        }
    }
    catch (e) {
        global.logError(e);
        Main.notify("Error:", e.message);
        return null;
    }

    return projects;
}

function get_project_name(project_path) {

    const projectConfigPath = GLib.build_filenamev([project_path, "project.godot"]);
    const projectConfigFile = Gio.File.new_for_path(projectConfigPath);

    if (!projectConfigFile.query_exists(null)){
        // Not notifying to avoid annoying spam
        global.log("Warning: Couldn't fetch project name for " + project_path);
        return null;
    }

    const [, contents] = projectConfigFile.load_contents(null);
    
    const decoder = new TextDecoder("utf-8");
    const contentsString = decoder.decode(contents);

    const applicationGroupRegex = /(\[application].+?)\[/s;

    const applicationGroupText = contentsString
        .match(applicationGroupRegex)[1] // Get the brackets only, not including last '['
        .replace(';', '#'); // Replace comment char from ; to # so KeyFile parsing will work 

    let keyFile = new GLib.KeyFile();
    let projectName;

    try {
        keyFile.load_from_data(applicationGroupText, applicationGroupText.length, GLib.KeyFileFlags.NONE);
        projectName = keyFile.get_value("application", "config/name");
    }
    catch (e) {
        global.logError(e);
        return null;
    }

    // Return name without quotation marks
    return projectName.slice(1, -1);
}