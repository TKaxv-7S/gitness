// Copyright 2022 Harness Inc. All rights reserved.
// Use of this source code is governed by the Polyform Free Trial License
// that can be found in the LICENSE.md file for this repository.

package account

import (
	"os"

	"github.com/harness/gitness/cli/util"

	"gopkg.in/alecthomas/kingpin.v2"
)

type logoutCommand struct{}

func (c *logoutCommand) run(*kingpin.ParseContext) error {
	path, err := util.Config()
	if err != nil {
		return err
	}
	return os.Remove(path)
}

// helper function to register the logout command.
func RegisterLogout(app *kingpin.Application) {
	c := new(logoutCommand)

	app.Command("logout", "logout from the remote server").
		Action(c.run)
}