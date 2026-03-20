const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Util = imports.misc.util;
const Main = imports.ui.main;

const ProjectParser = require("./projectParser");

/*
TODO:
REMINDER: do cinnamon --replace to view better errors!
CHECK IF NO MULTIPLE NOTIFS
1. check variable names inconsistencies like projectFile and projectsFile across both classes and individually inside each class also projectParser.js
2. fix when u write an unexistant command it just doesn't do anything, maybe use spawnCommandLineAsyncIO instead
3. async baby
4. add switch / option thingy to choose if to use normal or symbolic icon in taskbarr applet icon
*/

class ProjectMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(projectPath, isFavorite, showIcon, showPath, params) {
        super(params);

        this.box = new St.BoxLayout({
            style_class: 'popup-combobox-item',
            style: 'padding: 0px'
        });

        this.projectPath = projectPath;

        let displayText;

        if (showPath) {
            displayText = projectPath;
        }
        else {
            let projectName = ProjectParser.getProjectName(projectPath, this.appletName);

            if (projectName) {
                displayText = projectName
            }
            else {
                // Keep the path as the name
                displayText = projectPath;
            }
        }

        if (showIcon) {
            let icon = new St.Icon({
                icon_name: isFavorite ? 'starred-symbolic' : 'non-starred-symbolic',
                style_class: 'system-status-icon',
            });
    
            this.box.add(icon);
        }
        
        let label = new St.Label({
            text: displayText,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.box.add(label);
        this.addActor(this.box);
    }
}

class badMessageMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(displayText) {
        super({reactive: false});
        
        let label = new St.Label({
            text: displayText,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.addActor(label);
    }
}

class GodotProjects extends Applet.IconApplet {
    constructor(metadata, orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);

        this.appletName = "Godot Projects";
        this.set_applet_icon_name("godot-applet-icon");
        this.set_applet_tooltip(_("Project List"));

        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);
        
        this.mainContainer = new St.BoxLayout({vertical: true});
        this.menu.addActor(this.mainContainer);

        this.projectsScrollBox = new St.ScrollView({
            x_fill: true,
            y_fill: false,
            y_align: St.Align.START
        });
        this.projectsScrollBox.set_auto_scrolling(true);
        this.mainContainer.add(this.projectsScrollBox);

        this.menuBox = new St.BoxLayout({vertical: true});
        this.projectsScrollBox.add_actor(this.menuBox);
        this.projectsScrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this.projectsScrollBox.add_style_class_name("vfade");
        
        this.settings = new Settings.AppletSettings(this, metadata.uuid, this.instance_id)
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "show-full-path",
                                   "show_full_path",
                                   this.refreshProjects,
                                   null);
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "show-star-icons",
                                   "show_star_icons",
                                   this.refreshProjects,
                                   null);
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "godot-command",
                                   "godot_command",
                                   null,
                                   null);
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "godot-flags",
                                   "godot_flags",
                                   null,
                                   null);
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "custom-projects-path",
                                   "custom_projects_path",
                                   this.refreshAll,
                                   null);
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "projects-file-uri",
                                   "projects_file_uri",
                                   this.refreshAll,
                                   null);
   
        this.MenuItems = [];
        
        this.projectsFileName = "projects.cfg"
        
        const defaultProjectPath = GLib.build_filenamev([
            GLib.get_home_dir(),
            ".local",
            "share",
            "godot",
            this.projectsFileName
        ]);

        this.defaultProjectFile = Gio.File.new_for_path(defaultProjectPath);
        
        this.projectFile = null;

        this.projectFileMonitor = null;

        // Signal handler ID, used for disconnecting the signal
        this.projects_id = 0;

        this.refreshAll();
    }

    _modifyAndMonitorProjectsFile(projectFile) {
        this.projectFile = projectFile
        this._stopMonitoringCompletely();
        
        // Shouldn't happen but just incase
        if (!this.projectFile.query_exists(null)){
            let msg = "Couldn't monitor projects file because it doesn't exist, please modify the applet's config or look at the logs!";
            Main.notifyError(this.appletName, msg)
            global.logError(
                this.appletName +
                ": File " +
                this.projectFile.path() +
                " doesn't exist!"
            );
            this.showProjectsInPopup = false;
            this.badMessage(msg);
            return;
        }
        

        this.projectFileMonitor = this.projectFile.monitor_file(
            Gio.FileMonitorFlags.NONE,
            null
        );
        this.projects_id = this.projectFileMonitor.connect("changed", () => {
            this.refreshProjects();
        });
    }

    _stopMonitoringCompletely() {
        if (this.projectFileMonitor) {
            if (this.projects_id > 0) {
                this.projectFileMonitor.disconnect(this.projects_id);
                this.projects_id = 0;
            }
            this.projectFileMonitor.cancel();
            this.projectFileMonitor = null;
        }
    }

    refreshProjectsFile() {
        this.showProjectsInPopup = true;

        if (
            this.custom_projects_path &&
            this.projects_file_uri
        ) {
            const projectsFile = Gio.File.new_for_uri(this.projects_file_uri);
            if (projectsFile.get_basename() === this.projectsFileName) {
                this._modifyAndMonitorProjectsFile(projectsFile);
            }
            else {
                this.projectFile = null;
                this.showProjectsInPopup = false;
                this._stopMonitoringCompletely();
                let msg = "File must be named " + this.projectsFileName + ", choose another file!";
                Main.notify(this.appletName, msg);
                this.badMessage(msg);
            }
        }
        // Switched on but no file chosen
        else if (this.custom_projects_path) {
            this.projectFile = null;
            this.showProjectsInPopup = false;
            this.badMessage("Please select a file in the settings!");
            this._stopMonitoringCompletely();
        }
        else if (this.defaultProjectFile.query_exists(null)){
            this._modifyAndMonitorProjectsFile(this.defaultProjectFile);
        }
        // Couldn't find the default file
        else {
            this.projectFile = null;
            this.showProjectsInPopup = false;
            this._stopMonitoringCompletely();

            let msg = "Couldn't find the default projects.cfg file, choose a file in the settings!";

            Main.notify(this.appletName, msg);
            this.badMessage(msg);
        }
    }

    refreshProjects() {
        if (!this.showProjectsInPopup || !this.projectFile) {
            return;
        }

        let projects = ProjectParser.getProjectList(this.projectFile, this.appletName);
        
        if (!projects) {
            this.showProjectsInPopup = false;
            this.badMessage("Failed to parse projects file!");
            return;
        }
        else if (
            projects.favorites.length == 0 &&
            projects.nonFavorites.length == 0
        ) {
            /*
                Not disabling this.showProjectsInPopup because the file
                was parsed successfully, just no project exists yet!
            */
            this.badMessage("You don't have any projects yet.");
            return;
        }

        for (let projectButton of this.MenuItems) {
            projectButton.destroy();
        }
        this.MenuItems = [];


        for (const key of ["favorites", "nonFavorites"]) {
            const isFavorite = key == "favorites";
            for (const project of projects[key]) {
                let button = new ProjectMenuItem(
                    project,
                    isFavorite,
                    this.show_star_icons,
                    this.show_full_path
                );
                
                button.connect("activate", (button, event)=> {
                    global.log("yolobutn");
                    let command_arr = this.godot_command + " " + this.godot_flags + " " + project;
                    Util.spawnCommandLineAsync(
                        command_arr, null, () => {
                            Main.notifyError(
                                this.appletName,
                                "Couldn't execute: " +
                                this.godot_command +
                                " try changing it in the settings!"
                            );
                        }
                    );
                    this.menu.toggle();
                });
        
                this.MenuItems.push(button);
                this.menuBox.add_child(button.actor);
            }
        }
    }

    badMessage(displayText) {
        for (let projectButton of this.MenuItems) {
            projectButton.destroy();
        }
        this.MenuItems = [];
        
        let badMessageItem = new badMessageMenuItem(displayText);

        this.MenuItems.push(badMessageItem);
        this.menuBox.add_child(badMessageItem.actor);
    }

    refreshAll() {
        this.refreshProjectsFile();
        this.refreshProjects();
    }

    on_applet_clicked() {
        this.menu.toggle();
    }

    on_applet_removed_from_panel() {
        this._stopMonitoringCompletely();

        if (this.settings) {
            this.settings.finalize();
        }
    }

    destroy() {
        this._stopMonitoringCompletely();

        this.actor._delegate = null;
        this.menu.destroy();
        this.emit("destroy");
    }
}

function main(metadata, orientation, panel_height, instance_id) {
    return new GodotProjects(metadata, orientation, panel_height, instance_id);
}
