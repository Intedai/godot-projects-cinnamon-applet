const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Util = imports.misc.util;

const ProjectParser = require("./projectParser");

class ProjectMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(projectPath, isFavorite, show_icon, show_path, params) {
        super(params);

        this.box = new St.BoxLayout({
            style_class: 'popup-combobox-item',
            style: 'padding: 0px'
        });

        this.projectPath = projectPath;

        let displayText;

        if (show_path) {
            displayText = projectPath;
        }
        else {
            let projectName = ProjectParser.get_project_name(projectPath);

            if (projectName) {
                displayText = projectName
            }
            else {
                // Keep the path as the name
                displayText = projectPath;
            }
        }

        if (show_icon) {
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

class GodotProjects extends Applet.IconApplet {
    constructor(metadata, orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);

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

        this.projectsBox = new St.BoxLayout({vertical: true});
        this.projectsScrollBox.add_actor(this.projectsBox);
        this.projectsScrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this.projectsScrollBox.add_style_class_name("vfade");
        
        this.settings = new Settings.AppletSettings(this, metadata.uuid, this.instance_id)
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "show-full-path",
                                   "show_full_path",
                                   this.on_settings_changed,
                                   null);
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "show-star-icons",
                                   "show_star_icons",
                                   this.on_settings_changed,
                                   null);
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "godot-path",
                                   "godot_path",
                                   this.on_settings_changed,
                                   null);
        this.settings.bindProperty(Settings.BindingDirection.IN,
                                   "godot-flags",
                                   "godot_flags",
                                   this.on_settings_changed,
                                   null);
        
        this._projectButtons = [];

        this.projectPath = GLib.build_filenamev([
            GLib.get_home_dir(),
            ".local",
            "share",
            "godot",
            "projects.cfg"
        ]);
        // TODO: Move to func:
        this.projectFile = Gio.File.new_for_path(this.projectPath);
        this.projectFileMonitor = this.projectFile.monitor_file(
            Gio.FileMonitorFlags.NONE,
            null
        );
        this.projectFileMonitor.connect("changed", () => {
            this._refreshProjects();
        });
        this._refreshProjects();
    }
    
    _refreshProjects() {
        for (let projectButton of this._projectButtons) {
            projectButton.destroy();
        }
        this._projectButtons = [];

        let projects = ProjectParser.get_project_list(this.projectPath);
        
        if (!projects) {
            return;
        }

        for (const key of ["favorites", "non_favorites"]) {
            const isFavorite = key == "favorites";
            for (const project of projects[key]) {
                let button = new ProjectMenuItem(
                    project,
                    isFavorite,
                    this.show_star_icons,
                    this.show_full_path
                );
                
                button.connect("activate", (button, event)=> {
                    let command_arr = [this.godot_path].concat(this.godot_flags.split(" ")).concat([project]);
                    Util.spawn_async(command_arr);
                    this.menu.toggle();
                });
        
                this._projectButtons.push(button);
                this.projectsBox.add_child(button.actor);
            }
        }
    }

    on_settings_changed() {
        this._refreshProjects();
    }

    on_applet_clicked() {
        this.menu.toggle();
    }
}

function main(metadata, orientation, panel_height, instance_id) {
    return new GodotProjects(metadata, orientation, panel_height, instance_id);
}
