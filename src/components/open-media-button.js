/* global APP*/
import { isLocalHubsUrl, isLocalHubsSceneUrl, isHubsRoomUrl, isLocalHubsAvatarUrl } from "../utils/media-url-utils";
import { guessContentType } from "../utils/media-url-utils";
import { handleExitTo2DInterstitial } from "../utils/vr-interstitial";
import { changeHub } from "../change-hub";
import { getReticulumFetchUrl } from "../utils/phoenix-utils";

AFRAME.registerComponent("open-media-button", {
  schema: {
    onlyOpenLink: { type: "boolean" }
  },
  init() {
    this.label = this.el.querySelector("[text]");

    this.updateSrc = async () => {
      if (!this.targetEl.parentNode) return; // If removed
      const mediaLoader = this.targetEl.components["media-loader"].data;
      const src = (this.src = (mediaLoader.mediaOptions && mediaLoader.mediaOptions.href) || mediaLoader.src);
      const visible = src && guessContentType(src) !== "video/vnd.hubs-webrtc";
      const mayChangeScene = this.el.sceneEl.systems.permissions.canOrWillIfCreator("update_hub");

      this.el.object3D.visible = !!visible;

      if (visible) {
        let label = "accedir";
        if (!this.data.onlyOpenLink) {
          let hubId;
          if (await isLocalHubsAvatarUrl(src)) {
            label = "fer servir avatar";
          } else if ((await isLocalHubsSceneUrl(src)) && mayChangeScene) {
            label = "fer servir escena";
          } else if ((hubId = await isHubsRoomUrl(src))) {
            const url = new URL(src);
            if (url.hash && window.APP.hub.hub_id === hubId) {
              label = "anar a";
            } else {
              label = "visitar sala";
            }
          }
        }
        this.label.setAttribute("text", "value", label);
      }
    };

    this.onClick = async () => {
      const mayChangeScene = this.el.sceneEl.systems.permissions.canOrWillIfCreator("update_hub");

      const exitImmersive = async () => await handleExitTo2DInterstitial(false, () => {}, true);

      let hubId;
      if (this.data.onlyOpenLink) {
        await exitImmersive();
        window.open(this.src);
      } else if (await isLocalHubsAvatarUrl(this.src)) {
        const avatarId = new URL(this.src).pathname.split("/").pop();
        window.APP.store.update({ profile: { avatarId } });
        this.el.sceneEl.emit("avatar_updated");
      } else if ((await isLocalHubsSceneUrl(this.src)) && mayChangeScene) {
        this.el.sceneEl.emit("scene_media_selected", this.src);
      } else if ((hubId = await isHubsRoomUrl(this.src))) {
        const url = new URL(this.src);
        if (url.hash && window.APP.hub.hub_id === hubId) {
          // move to waypoint w/o writing to history
          window.history.replaceState(null, null, window.location.href.split("#")[0] + url.hash);
        } else if (APP.store.state.preferences.fastRoomSwitching && isLocalHubsUrl(this.src)) {
          // move to new room without page load or entry flow
          const publicRooms = getReticulumFetchUrl("/api/v1/media/search?source=rooms&filter=public");
          
          let canChange = -1;

          await fetch(publicRooms, {
            method: "GET"
          }).then(r => r.json()).then((sales) =>
          {
            sales.entries.every(element => {

              if(element.id == hubId)
              {
                const DEFAULT_MAX_ROOMSIZE = 20; // màxim per garantir un bon funcionament d'audio (recomenat per hubs i usuaris discord hubs)

                let roomSize = element.room_size;

                if(roomSize > DEFAULT_MAX_ROOMSIZE)
                {
                  roomSize = DEFAULT_MAX_ROOMSIZE;
                }

                var Pcount = element.member_count; // agafem el total de persones dins la sala

                if(Pcount < roomSize)
                {
                  canChange = 1; // la sala és publica i es pot entrar
                  changeHub(hubId);
                  
                }
                else
                {
                  canChange = 0; // la sala és pública però no es pot entrar
                  this.label.setAttribute("text", "value", "Sala plena");
                  APP.messageDispatch.log("joinFailed", { message: "Sala plena" });
                  setTimeout(() => {this.label.setAttribute("text", "value", "visitar sala")},2000);
                }
                return false;
              }
              return true;
            });

            if(canChange == -1) // La sala no és pública, per tant, entrem
            {
              changeHub(hubId);
            }

          });
          
        } else {
          await exitImmersive();
          location.href = this.src;
        }
      } else {
        await exitImmersive();
        window.open(this.src);
      }
    };

    NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
      this.targetEl = networkedEl;
      this.targetEl.addEventListener("media_resolved", this.updateSrc, { once: true });
      this.updateSrc();
    });
  },

  play() {
    this.el.object3D.addEventListener("interact", this.onClick);
  },

  pause() {
    this.el.object3D.removeEventListener("interact", this.onClick);
  }
});
