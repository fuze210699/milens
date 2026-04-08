package service

import "models"

type UserService struct {
	users []models.User
}

func NewUserService() *UserService {
	return &UserService{}
}

func (s *UserService) Register(name, email string) *models.User {
	user := models.NewUser(name, email)
	s.users = append(s.users, *user)
	return user
}
