const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;

function getProjectList(projectsFile, appletName) {
    if (!projectsFile.query_exists(null)){
        let msg = _("Projects file does not exist, try choosing another one!");
        Main.notifyError(appletName, msg);
        global.logError("%s: %s".format(appletName, msg));
        return null;
    }
    
    const keyFile = new GLib.KeyFile();
    let groups;

    let projects = {
        favorites: [],
        nonFavorites: []
    };

    try {
        keyFile.load_from_file(projectsFile.get_path(), GLib.KeyFileFlags.NONE);
    
        [groups, ] = keyFile.get_groups();

        for(const group of groups) {
            if (keyFile.get_boolean(group, "favorite")) {
                projects.favorites.push(group);
            }
            else {
                projects.nonFavorites.push(group);
            }
        }
    }
    catch (e) {

        Main.notifyError(
            appletName,
            _("Failed to parse projects file: %s. Try choosing another file in the settings or look at the logs!")
                .format(projectsFile.get_basename())
        );
        global.logError(e);
        return null;
    }

    return projects;
}

function getProjectName(projectPath, appletName) {

    const projectConfigPath = GLib.build_filenamev([projectPath, "project.godot"]);
    const projectConfigFile = Gio.File.new_for_path(projectConfigPath);

    if (!projectConfigFile.query_exists(null)){
        // Not notifying to avoid annoying spam
        global.log(_("%s: Could not fetch project name for %s").format(appletName ,projectPath));
        return null;
    }

    const [, contents] = projectConfigFile.load_contents(null);
    
    const decoder = new TextDecoder("utf-8");
    const contentsString = decoder.decode(contents);

    const projectNameRegex = /\[application].+config\/name="(.+?)"/s;

    const projectName = contentsString
        .match(projectNameRegex)[1]

    return projectName;
}