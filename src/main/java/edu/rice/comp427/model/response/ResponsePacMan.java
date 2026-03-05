package edu.rice.comp427.model.response;

import edu.rice.comp427.model.map.Map;
import edu.rice.comp427.model.objects.Ghost;
import edu.rice.comp427.model.objects.Pacman;

public class ResponsePacMan {
    Pacman pacman;

    /**
     * Constructor.
     */
    public ResponsePacMan makeResponse(Pacman pacman) {
        this.pacman = pacman;
        return this;
    }
}
